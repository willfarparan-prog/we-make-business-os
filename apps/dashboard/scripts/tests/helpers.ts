/** Shared test setup: a fresh in-memory Postgres per test, and a fake Stripe that records what it was asked. */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import type Stripe from "stripe";
import { setSandboxDatabase, type Database } from "@/db";
import * as schema from "@/db/schema";

Object.assign(process.env, {
  WM_LOCAL_DB: "memory",
  WM_OWNER_EMAIL: "owner@example.com",
  WM_SITE_URL: "https://we-make.vercel.app",
});

export async function freshDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema }) as unknown as Database;
  const { apply } = await pushSchema(schema, db as never);
  await apply();
  setSandboxDatabase(db);
  return { db, client };
}

export async function addProduct(db: Database, values: Partial<typeof schema.products.$inferInsert> & { handle: string }, stock = 0) {
  const [product] = await db
    .insert(schema.products)
    .values({ name: values.handle, category: "Planters", priceCents: 10000, status: "active", madeToOrder: false, ...values })
    .returning();
  await db.insert(schema.productStock).values({ productId: product.id, onHand: stock });
  return product;
}

export async function stockOf(db: Database, productId: string) {
  const [row] = await db.select().from(schema.productStock).where(eq(schema.productStock.productId, productId));
  return { onHand: row.onHand, reserved: row.reserved };
}

export function fakeStripe(options: { fail?: boolean } = {}) {
  const created: Array<{ params: Stripe.Checkout.SessionCreateParams; idempotencyKey?: string }> = [];
  let serial = 0;
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams, requestOptions?: { idempotencyKey?: string }) => {
          if (options.fail) throw new Error("Stripe is down");
          created.push({ params, idempotencyKey: requestOptions?.idempotencyKey });
          serial += 1;
          return { id: `cs_test_fake${String(serial).padStart(6, "0")}`, url: `https://checkout.stripe.test/${serial}` } as Stripe.Checkout.Session;
        },
      },
    },
  } as unknown as Pick<Stripe, "checkout">;
  return { stripe, created };
}

let eventSerial = 0;
export function stripeEvent(type: string, object: Record<string, unknown>, livemode = false): Stripe.Event {
  eventSerial += 1;
  return { id: `evt_${eventSerial}`, object: "event", type, livemode, created: 1_790_000_000, data: { object }, api_version: null, pending_webhooks: 0, request: null } as unknown as Stripe.Event;
}

/** A paid Checkout Session for an order, the way Stripe sends it. */
export function paidSession(orderId: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    object: "checkout.session",
    payment_status: "paid",
    metadata: { orderId },
    client_reference_id: orderId,
    amount_subtotal: 10000,
    amount_total: 11200,
    total_details: { amount_shipping: 1200, amount_tax: 0 },
    currency: "usd",
    created: 1_790_000_000,
    customer: "cus_test_1",
    payment_intent: "pi_test_1",
    customer_details: { email: "Buyer@Example.com", name: "Ada Lovelace", address: null },
    collected_information: { shipping_details: { name: "Ada Lovelace", address: { line1: "1 Main St", line2: null, city: "Fresno", state: "CA", postal_code: "93701", country: "US" } } },
    ...overrides,
  };
}
