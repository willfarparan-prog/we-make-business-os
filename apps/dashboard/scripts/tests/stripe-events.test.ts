/** Stripe webhooks → orders, stock and ledger. Every event is safe to receive twice, and in any order. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { startCheckout } from "@/lib/orders/checkout";
import { applyStripeEvent } from "@/lib/orders/stripe-events";
import { addProduct, fakeStripe, freshDatabase, paidSession, stockOf, stripeEvent } from "./helpers";

let db: Database;
let client: PGlite;
beforeEach(async () => {
  ({ db, client } = await freshDatabase());
  delete process.env.WM_STRIPE_LIVE;
});
afterEach(async () => client.close());

async function checkout(handle: string, quantity: number) {
  const result = await startCheckout(db, fakeStripe().stripe, { items: [{ handle, quantity }] });
  assert.ok(result.ok);
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, result.orderId));
  return order;
}

test("a paid session marks the order paid, takes the pieces off the shelf once, and books the payment", async () => {
  const product = await addProduct(db, { handle: "arcadia-tall-planter" }, 3);
  const order = await checkout("arcadia-tall-planter", 2);
  const event = stripeEvent("checkout.session.completed", paidSession(order.id, order.checkoutSessionId!));

  assert.deepEqual(await applyStripeEvent(db, event), { handled: true });
  assert.deepEqual(await applyStripeEvent(db, event), { handled: true }, "a redelivery is fine");

  const [paid] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  assert.equal(paid.status, "paid");
  assert.equal(paid.totalCents, 11200);
  assert.equal(paid.shippingAddress?.city, "Fresno");
  assert.deepEqual(await stockOf(db, product.id), { onHand: 1, reserved: 0 });
  assert.equal((await db.select().from(schema.stockMovements)).length, 1);
  const ledger = await db.select().from(schema.payments);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amountCents, 11200);

  const [buyer] = await db.select().from(schema.contacts);
  assert.equal(buyer.email, "buyer@example.com");
  assert.equal(buyer.type, "customer");
  assert.equal((await db.select().from(schema.consentRecords)).length, 0, "buying isn't newsletter consent");
});

test("an expired session gives the pieces back; money arriving later still makes a (made-for-you) order", async () => {
  const product = await addProduct(db, { handle: "tidal-mosaic-catchall" }, 2);
  const order = await checkout("tidal-mosaic-catchall", 2);
  await applyStripeEvent(db, stripeEvent("checkout.session.expired", { id: order.checkoutSessionId, metadata: { orderId: order.id } }));
  assert.deepEqual(await stockOf(db, product.id), { onHand: 2, reserved: 0 });

  await applyStripeEvent(db, stripeEvent("checkout.session.completed", paidSession(order.id, order.checkoutSessionId!)));
  const [late] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  assert.equal(late.status, "paid");
  assert.deepEqual(await stockOf(db, product.id), { onHand: 2, reserved: 0 }, "nothing was held, so nothing is taken");
  const [item] = await db.select().from(schema.orderItems);
  assert.equal(item.reservedQty, 0, "production now owes both pieces");
});

test("bank payments hold stock until the money clears", async () => {
  const product = await addProduct(db, { handle: "axis-desk-caddy" }, 1);
  const order = await checkout("axis-desk-caddy", 1);
  await applyStripeEvent(db, stripeEvent("checkout.session.completed", paidSession(order.id, order.checkoutSessionId!, { payment_status: "unpaid" })));
  const [waiting] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  assert.equal(waiting.status, "pending");
  assert.ok(waiting.expiresAt! > new Date(Date.now() + 10 * 24 * 60 * 60_000), "held for days, not minutes");
  await applyStripeEvent(db, stripeEvent("checkout.session.async_payment_succeeded", paidSession(order.id, order.checkoutSessionId!)));
  assert.deepEqual(await stockOf(db, product.id), { onHand: 0, reserved: 0 });
});

test("refunds reduce revenue and mark a fully refunded order", async () => {
  await addProduct(db, { handle: "strata-gallery-tray" }, 1);
  const order = await checkout("strata-gallery-tray", 1);
  await applyStripeEvent(db, stripeEvent("checkout.session.completed", paidSession(order.id, order.checkoutSessionId!)));
  await applyStripeEvent(db, stripeEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_test_1", amount: 11200, amount_refunded: 5000, refunded: false, currency: "usd" }));
  await applyStripeEvent(db, stripeEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_test_1", amount: 11200, amount_refunded: 11200, refunded: true, currency: "usd" }));
  const refunds = (await db.select().from(schema.payments)).filter((row) => row.kind === "refund");
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amountCents, -11200);
  const [refunded] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  assert.equal(refunded.status, "refunded");
});

test("live-mode events are ignored while the store runs in test mode", async () => {
  await addProduct(db, { handle: "aurelia-dry-stem-vase" }, 1);
  const order = await checkout("aurelia-dry-stem-vase", 1);
  const result = await applyStripeEvent(db, stripeEvent("checkout.session.completed", paidSession(order.id, order.checkoutSessionId!), true));
  assert.equal(result.handled, false);
  const [still] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
  assert.equal(still.status, "pending");
});
