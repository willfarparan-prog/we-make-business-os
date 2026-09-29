/** Checkout: database prices, stock held while paying, released when abandoned; made-to-order never runs out. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { mergeLines, releaseStaleReservations, startCheckout } from "@/lib/orders/checkout";
import { saveSettings } from "@/lib/settings";
import { addProduct, fakeStripe, freshDatabase, stockOf } from "./helpers";

let db: Database;
let client: PGlite;
beforeEach(async () => ({ db, client } = await freshDatabase()));
afterEach(async () => client.close());

test("the session is built from database prices, with free shipping over the threshold", async () => {
  await addProduct(db, { handle: "strata-gallery-tray", name: "Strata Gallery Tray", priceCents: 13800, image: "/products/tray.png" }, 5);
  const { stripe, created } = fakeStripe();
  const result = await startCheckout(db, stripe, { items: [{ handle: "strata-gallery-tray", quantity: 2, price: 1 }] });
  assert.ok(result.ok);
  const params = created[0].params;
  assert.equal(params.line_items?.[0].price_data?.unit_amount, 13800);
  assert.equal(params.line_items?.[0].quantity, 2);
  assert.deepEqual(params.line_items?.[0].price_data?.product_data?.images, ["https://we-make.vercel.app/products/tray.png"]);
  assert.equal(params.shipping_options?.[0].shipping_rate_data?.fixed_amount?.amount, 0, "27,600 is over the $250 threshold");
  assert.equal(params.metadata?.orderId, result.orderId);
  assert.equal(created[0].idempotencyKey, `wm-checkout-${result.orderId}`);
  assert.ok((params.expires_at ?? 0) - Math.floor(Date.now() / 1000) >= 30 * 60, "Stripe rejects sessions that expire within 30 minutes");

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, result.orderId));
  assert.equal(order.status, "pending");
  assert.equal(order.subtotalCents, 27600);
  assert.equal(order.checkoutSessionId, "cs_test_fake000001");
  assert.deepEqual(await stockOf(db, (await db.select().from(schema.products))[0].id), { onHand: 5, reserved: 2 });
});

test("flat shipping below the threshold", async () => {
  await addProduct(db, { handle: "axis-desk-caddy", priceCents: 7600 }, 1);
  const { stripe, created } = fakeStripe();
  assert.ok((await startCheckout(db, stripe, { items: [{ handle: "axis-desk-caddy", quantity: 1 }] })).ok);
  assert.equal(created[0].params.shipping_options?.[0].shipping_rate_data?.fixed_amount?.amount, 1200);
});

test("the last piece goes to one shopper; the other is told it sold out", async () => {
  const product = await addProduct(db, { handle: "arcadia-tall-planter" }, 1);
  const { stripe } = fakeStripe();
  const [first, second] = await Promise.all([
    startCheckout(db, stripe, { items: [{ handle: "arcadia-tall-planter", quantity: 1 }] }),
    startCheckout(db, stripe, { items: [{ handle: "arcadia-tall-planter", quantity: 1 }] }),
  ]);
  const outcomes = [first, second].map((result) => (result.ok ? "ok" : result.status)).sort();
  assert.deepEqual(outcomes, [409, "ok"]);
  const loser = [first, second].find((result) => !result.ok);
  assert.ok(loser && !loser.ok && loser.unavailable?.includes("arcadia-tall-planter"));
  assert.deepEqual(await stockOf(db, product.id), { onHand: 1, reserved: 1 });
  const cancelled = await db.select().from(schema.orders).where(eq(schema.orders.status, "cancelled"));
  assert.equal(cancelled.length, 1, "the losing checkout's order is closed, holding nothing");
});

test("a failed line undoes the whole bag's holds", async () => {
  const plenty = await addProduct(db, { handle: "plenty" }, 5);
  await addProduct(db, { handle: "scarce" }, 1);
  const { stripe } = fakeStripe();
  const result = await startCheckout(db, stripe, { items: [{ handle: "plenty", quantity: 2 }, { handle: "scarce", quantity: 2 }] });
  assert.ok(!result.ok && result.status === 409);
  assert.deepEqual(!result.ok && result.unavailable, ["scarce"]);
  assert.deepEqual(await stockOf(db, plenty.id), { onHand: 5, reserved: 0 });
});

test("made-to-order pieces take what's on the shelf and make the rest", async () => {
  const product = await addProduct(db, { handle: "aurelia-dry-stem-vase", madeToOrder: true }, 1);
  const { stripe } = fakeStripe();
  const result = await startCheckout(db, stripe, { items: [{ handle: "aurelia-dry-stem-vase", quantity: 3 }] });
  assert.ok(result.ok);
  const [item] = await db.select().from(schema.orderItems);
  assert.equal(item.quantity, 3);
  assert.equal(item.reservedQty, 1);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 1, reserved: 1 });
});

test("when Stripe fails, the hold is given back", async () => {
  const product = await addProduct(db, { handle: "tidal-mosaic-catchall" }, 2);
  const result = await startCheckout(db, fakeStripe({ fail: true }).stripe, { items: [{ handle: "tidal-mosaic-catchall", quantity: 2 }] });
  assert.ok(!result.ok && result.status === 502);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 2, reserved: 0 });
  const [order] = await db.select().from(schema.orders);
  assert.equal(order.status, "cancelled");
});

test("abandoned checkouts are released once Stripe can no longer complete them", async () => {
  const product = await addProduct(db, { handle: "solstice-countertop-vessel" }, 2);
  const { stripe } = fakeStripe();
  const past = new Date(Date.now() - 3 * 60 * 60_000);
  assert.ok((await startCheckout(db, stripe, { items: [{ handle: "solstice-countertop-vessel", quantity: 2 }] }, past)).ok);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 2, reserved: 2 });
  assert.equal(await releaseStaleReservations(db), 1);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 2, reserved: 0 });
  assert.equal(await releaseStaleReservations(db), 0, "releasing is done once");
});

test("unknown or inactive products, bad input, and a paused store", async () => {
  await addProduct(db, { handle: "draft-piece", status: "draft" }, 3);
  const { stripe } = fakeStripe();
  const missing = await startCheckout(db, stripe, { items: [{ handle: "draft-piece", quantity: 1 }, { handle: "nope", quantity: 1 }] });
  assert.ok(!missing.ok && missing.status === 409);
  assert.deepEqual(!missing.ok && missing.unavailable, ["draft-piece", "nope"]);
  const bad = await startCheckout(db, stripe, { items: [{ handle: "Draft Piece", quantity: 50 }] });
  assert.ok(!bad.ok && bad.status === 400);
  await saveSettings(db, { checkoutEnabled: false });
  const paused = await startCheckout(db, stripe, { items: [{ handle: "draft-piece", quantity: 1 }] });
  assert.ok(!paused.ok && paused.status === 503);
});

test("duplicate lines merge and cap at ten", () => {
  assert.deepEqual(mergeLines([{ handle: "a", quantity: 6 }, { handle: "b", quantity: 1 }, { handle: "a", quantity: 6 }]), [{ handle: "a", quantity: 10 }, { handle: "b", quantity: 1 }]);
});
