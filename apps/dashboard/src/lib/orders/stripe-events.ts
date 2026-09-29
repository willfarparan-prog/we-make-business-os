import "server-only";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { atomic, type Database } from "@/db";
import { orders } from "@/db/schema";
import { recordActivity, upsertContact } from "@/lib/contacts";
import { releaseStatement } from "@/lib/orders/checkout";
import { eventModeAllowed } from "@/lib/payments/stripe";

/*
 * Turns Stripe's webhooks into orders, stock and the money ledger.
 *
 * Stripe delivers at least once and sometimes out of order, so every step is
 * guarded: an order becomes paid only from pending (or from expired, if the
 * money arrived anyway); stock is drawn down once, marked by
 * stock_committed_at; ledger rows are unique per Stripe id.
 */

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOrder(db: Database, session: Stripe.Checkout.Session) {
  const fromMetadata = session.metadata?.orderId ?? session.client_reference_id ?? "";
  if (UUID.test(fromMetadata)) {
    const [order] = await db.select().from(orders).where(eq(orders.id, fromMetadata)).limit(1);
    if (order) return order;
  }
  const [bySession] = await db.select().from(orders).where(eq(orders.checkoutSessionId, session.id)).limit(1);
  return bySession ?? null;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

function shippingAddressOf(session: Stripe.Checkout.Session): Record<string, string | null> | null {
  const details = session.collected_information?.shipping_details ?? null;
  const address = details?.address ?? session.customer_details?.address ?? null;
  if (!address) return null;
  return {
    name: details?.name ?? session.customer_details?.name ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postalCode: address.postal_code ?? null,
    country: address.country ?? null,
  };
}

function splitName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

async function markPaid(db: Database, session: Stripe.Checkout.Session, livemode: boolean) {
  const order = await findOrder(db, session);
  if (!order) return { handled: false, note: "no matching order" };

  const email = session.customer_details?.email?.toLowerCase() ?? null;
  const name = session.customer_details?.name ?? null;
  const contact = email
    ? await upsertContact(db, { email, ...splitName(name), source: "Website order", type: "customer", tags: ["customer"], stripeCustomerId: idOf(session.customer) })
    : null;

  const subtotal = session.amount_subtotal ?? order.subtotalCents;
  const shipping = session.total_details?.amount_shipping ?? order.shippingCents;
  const tax = session.total_details?.amount_tax ?? 0;
  const total = session.amount_total ?? subtotal + shipping + tax;
  const paymentIntent = idOf(session.payment_intent);
  const address = shippingAddressOf(session);

  const [paid] = await atomic(db, [
    sql`update orders set
          status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now(),
          email = ${email}, name = ${name}, contact_id = ${contact?.id ?? null}::uuid,
          shipping_address = ${address ? JSON.stringify(address) : null}::jsonb,
          subtotal_cents = ${subtotal}, shipping_cents = ${shipping}, tax_cents = ${tax}, total_cents = ${total},
          payment_intent_id = ${paymentIntent}, checkout_session_id = coalesce(checkout_session_id, ${session.id}), livemode = ${livemode}
        where id = ${order.id}::uuid and status in ('pending', 'expired', 'cancelled')
        returning id`,
    // Pieces held for this order leave the shelf, once.
    sql`with o as (
          update orders set stock_committed_at = now()
          where id = ${order.id}::uuid and stock_committed_at is null and status = 'paid'
          returning id
        ),
        items as (
          select oi.product_id, oi.reserved_qty from order_items oi join o on oi.order_id = o.id where oi.reserved_qty > 0
        ),
        moved as (
          insert into stock_movements (product_id, delta, reason, ref_id, actor)
          select product_id, -reserved_qty, 'order_paid', ${order.id}, 'stripe' from items
          on conflict do nothing returning id
        )
        update product_stock ps set on_hand = ps.on_hand - items.reserved_qty, reserved = ps.reserved - items.reserved_qty, updated_at = now()
        from items where ps.product_id = items.product_id
        returning ps.product_id`,
    sql`insert into payments (order_id, contact_id, kind, amount_cents, currency, stripe_ref, payment_intent_id, description, livemode, occurred_at)
        values (${order.id}::uuid, ${contact?.id ?? null}::uuid, 'payment', ${total}, ${session.currency ?? "usd"}, ${session.id}, ${paymentIntent},
                ${`Order WM-${order.number}`}, ${livemode}, to_timestamp(${session.created}::double precision))
        on conflict (stripe_ref) do nothing`,
  ]);

  if (paid.length && contact) await recordActivity(db, contact.id, "order_paid", `Paid for order WM-${order.number}`, { orderId: order.id, totalCents: total });
  return { handled: true };
}

async function recordRefund(db: Database, charge: Stripe.Charge, livemode: boolean) {
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) return { handled: false, note: "refund without a payment intent" };
  const [order] = await db.select().from(orders).where(eq(orders.paymentIntentId, paymentIntent)).limit(1);
  // One ledger row per charge, holding the running refunded total, so partial refunds add up correctly.
  await db.execute(sql`insert into payments (order_id, contact_id, kind, amount_cents, currency, stripe_ref, payment_intent_id, description, livemode)
      values (${order?.id ?? null}::uuid, ${order?.contactId ?? null}::uuid, 'refund', ${-charge.amount_refunded}, ${charge.currency}, ${`refund:${charge.id}`},
              ${paymentIntent}, ${order ? `Refund for WM-${order.number}` : "Refund"}, ${livemode})
      on conflict (stripe_ref) do update set amount_cents = excluded.amount_cents, occurred_at = now()`);
  if (order && charge.refunded) {
    await db.execute(sql`update orders set status = 'refunded', updated_at = now()
        where id = ${order.id}::uuid and status in ('paid', 'packed', 'shipped', 'delivered')`);
  }
  return { handled: true };
}

export async function applyStripeEvent(db: Database, event: Stripe.Event): Promise<{ handled: boolean; note?: string }> {
  if (!eventModeAllowed(event.livemode)) return { handled: false, note: `ignored ${event.livemode ? "live" : "test"}-mode event` };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Bank debits complete first and pay days later; keep their pieces held
      // (the stale sweep would otherwise release them) until async_payment_succeeded.
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        const order = await findOrder(db, session);
        if (order) await db.execute(sql`update orders set expires_at = now() + interval '14 days', updated_at = now() where id = ${order.id}::uuid and status = 'pending'`);
        return { handled: true, note: "awaiting payment" };
      }
      return markPaid(db, session, event.livemode);
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = await findOrder(db, session);
      if (!order) return { handled: false, note: "no matching order" };
      await atomic(db, [releaseStatement(order.id, event.type === "checkout.session.expired" ? "expired" : "cancelled")]);
      return { handled: true };
    }
    case "charge.refunded":
      return recordRefund(db, event.data.object as Stripe.Charge, event.livemode);
    default:
      return { handled: false, note: "not a handled event" };
  }
}
