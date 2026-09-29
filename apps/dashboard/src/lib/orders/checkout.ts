import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { atomic, type Database } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { MAX_LINE_QTY } from "@/lib/catalog";
import { ensureStockRows, isStockViolation } from "@/lib/inventory";
import { productsWithStock } from "@/lib/products";
import { getSettings, shippingFor } from "@/lib/settings";
import { absoluteImage, siteUrl } from "@/lib/urls";

/*
 * Checkout, from the storefront's bag to a Stripe Checkout page.
 *
 * Prices always come from the database, never from the browser. A pending
 * order *is* the stock reservation: pieces on the shelf are held while the
 * shopper pays, and released if they walk away. Made-to-order pieces never
 * run out; whatever the shelf can't cover is made for the order.
 */

/** Stripe won't accept a Checkout Session that expires sooner than 30 minutes. */
const SESSION_MINUTES = 32;
/** A pending order older than its session plus this is released even if Stripe's webhook never came. */
const STALE_GRACE_MINUTES = 10;

export const checkoutInput = z.object({
  items: z
    .array(z.object({ handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/), quantity: z.number().int().min(1).max(MAX_LINE_QTY) }))
    .min(1)
    .max(20),
});

export type CheckoutResult =
  | { ok: true; url: string; orderId: string; orderNumber: number }
  | { ok: false; status: number; error: string; unavailable?: string[] };

/** Duplicate handles become one line, capped at the per-line maximum. */
export function mergeLines(items: Array<{ handle: string; quantity: number }>) {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.handle, Math.min(MAX_LINE_QTY, (merged.get(item.handle) ?? 0) + item.quantity));
  return [...merged].map(([handle, quantity]) => ({ handle, quantity }));
}

/**
 * Gives back everything a pending order was holding and closes it.
 * Only a pending order changes, so running this twice, or racing a payment, is safe.
 */
export function releaseStatement(orderId: string, status: "expired" | "cancelled") {
  return sql`with o as (
      update orders set status = ${status}, stock_released_at = now(), updated_at = now()
      where id = ${orderId}::uuid and status = 'pending' and stock_committed_at is null
      returning id
    ),
    items as (
      select oi.id, oi.product_id, oi.reserved_qty from order_items oi join o on oi.order_id = o.id where oi.reserved_qty > 0
    ),
    freed as (
      update product_stock ps set reserved = ps.reserved - items.reserved_qty, updated_at = now()
      from items where ps.product_id = items.product_id returning ps.product_id
    )
    update order_items set reserved_qty = 0 where id in (select id from items) returning id`;
}

export async function releaseOrder(db: Database, orderId: string, status: "expired" | "cancelled") {
  await atomic(db, [releaseStatement(orderId, status)]);
}

/** Frees pieces held by checkouts that were abandoned long enough ago that Stripe can no longer complete them. */
export async function releaseStaleReservations(db: Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_GRACE_MINUTES * 60_000);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, cutoff)))
    .limit(50);
  for (const order of stale) await releaseOrder(db, order.id, "expired");
  return stale.length;
}

type StripeLike = Pick<Stripe, "checkout">;

export async function startCheckout(db: Database, stripe: StripeLike, raw: unknown, now = new Date()): Promise<CheckoutResult> {
  const parsed = checkoutInput.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "Your bag couldn't be read. Please refresh and try again." };
  const lines = mergeLines(parsed.data.items);

  const settings = await getSettings(db);
  if (!settings.checkoutEnabled) return { ok: false, status: 503, error: "Checkout is paused for a moment. Please try again soon." };

  await releaseStaleReservations(db, now);

  const handles = lines.map((line) => line.handle);
  const found = await db.select({ id: products.id, handle: products.handle }).from(products).where(and(inArray(products.handle, handles), eq(products.status, "active")));
  const missing = handles.filter((handle) => !found.some((product) => product.handle === handle));
  if (missing.length) return { ok: false, status: 409, error: "Some pieces in your bag are no longer available.", unavailable: missing };

  await ensureStockRows(db, found.map((product) => product.id));
  const catalog = new Map((await productsWithStock(db, settings)).map((product) => [product.handle, product]));
  const priced = lines.map((line) => ({ ...line, product: catalog.get(line.handle)! }));

  const subtotal = priced.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0);
  const shipping = shippingFor(subtotal, settings);
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);

  const [order] = await db
    .insert(orders)
    .values({ status: "pending", source: "website", subtotalCents: subtotal, shippingCents: shipping, totalCents: subtotal + shipping, expiresAt })
    .returning({ id: orders.id, number: orders.number });
  const items = await db
    .insert(orderItems)
    .values(priced.map((line) => ({
      orderId: order.id,
      productId: line.product.id,
      handle: line.product.handle,
      name: line.product.name,
      unitPriceCents: line.product.priceCents,
      quantity: line.quantity,
      unitCostCents: line.product.cost.totalCents,
    })))
    .returning({ id: orderItems.id, productId: orderItems.productId });

  // Hold pieces from the shelf. Made-to-order lines take what's there; the
  // rest are held strictly, and a shortfall fails the CHECK and undoes it all.
  const reservations = priced.map((line) => {
    const itemId = items.find((item) => item.productId === line.product.id)!.id;
    return line.product.madeToOrder
      ? sql`with take as (
            select least(${line.quantity}, greatest(on_hand - reserved, 0)) as n
            from product_stock where product_id = ${line.product.id}::uuid for update
          ),
          held as (
            update product_stock set reserved = reserved + (select n from take), updated_at = now()
            where product_id = ${line.product.id}::uuid returning product_id
          )
          update order_items set reserved_qty = (select n from take) where id = ${itemId}::uuid returning id`
      : sql`with held as (
            update product_stock set reserved = reserved + ${line.quantity}, updated_at = now()
            where product_id = ${line.product.id}::uuid returning product_id
          )
          update order_items set reserved_qty = ${line.quantity} where id = ${itemId}::uuid returning id`;
  });

  try {
    await atomic(db, reservations);
  } catch (error) {
    if (!isStockViolation(error)) throw error;
    await releaseOrder(db, order.id, "cancelled");
    const fresh = new Map((await productsWithStock(db, settings)).map((product) => [product.handle, product]));
    const unavailable = priced.filter((line) => !line.product.madeToOrder && (fresh.get(line.handle)?.available ?? 0) < line.quantity).map((line) => line.handle);
    return { ok: false, status: 409, error: "Some pieces just sold out. Your bag has been updated.", unavailable };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: priced.map((line) => {
          const image = absoluteImage(line.product.image);
          return {
            quantity: line.quantity,
            price_data: {
              currency: "usd",
              unit_amount: line.product.priceCents,
              product_data: {
                name: line.product.name,
                description: line.product.material || undefined,
                images: image.startsWith("https://") ? [image] : undefined,
                metadata: { handle: line.product.handle },
              },
            },
          };
        }),
        shipping_address_collection: { allowed_countries: ["US"] },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: shipping, currency: "usd" },
              display_name: shipping === 0 ? "Complimentary domestic shipping" : "Standard domestic shipping",
            },
          },
        ],
        client_reference_id: order.id,
        metadata: { orderId: order.id, orderNumber: String(order.number), source: "we-make-site" },
        payment_intent_data: { metadata: { orderId: order.id, orderNumber: String(order.number) } },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${siteUrl()}/order/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}/order/cancelled`,
      },
      { idempotencyKey: `wm-checkout-${order.id}` },
    );
  } catch (error) {
    console.error("[checkout] Stripe session failed", order.id, error);
    await releaseOrder(db, order.id, "cancelled");
    return { ok: false, status: 502, error: "We couldn't open secure checkout just now. Please try again in a moment." };
  }

  await db.update(orders).set({ checkoutSessionId: session.id, updatedAt: sql`now()` }).where(eq(orders.id, order.id));
  if (!session.url) return { ok: false, status: 502, error: "Stripe didn't return a checkout page. Please try again." };
  return { ok: true, url: session.url, orderId: order.id, orderNumber: order.number };
}
