/** Batches add finished pieces to stock exactly once, draw materials down, and number editions. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { adjustStock, completeBatch, restockReturn } from "@/lib/inventory";
import { addProduct, freshDatabase, stockOf } from "./helpers";

let db: Database;
let client: PGlite;
beforeEach(async () => ({ db, client } = await freshDatabase()));
afterEach(async () => client.close());

async function batch(productId: string, code: string, printerId: string | null = null) {
  const [row] = await db.insert(schema.productionBatches).values({ code, productId, plannedQty: 6, printerId }).returning();
  return row;
}

test("completing a batch posts good pieces, uses materials with waste, and logs printer hours, once", async () => {
  const product = await addProduct(db, { handle: "arcadia-tall-planter", printHours: "6" }, 1);
  const [resin] = await db.insert(schema.materials).values({ name: "Resin", unit: "ml", onHand: "1000" }).returning();
  await db.insert(schema.productMaterials).values({ productId: product.id, materialId: resin.id, qtyPerPiece: "60", wasteFactor: "1.1" });
  const [printer] = await db.insert(schema.printers).values({ name: "Printer 1", totalPrintHours: "100" }).returning();
  const run = await batch(product.id, "B-0001", printer.id);

  assert.deepEqual(await completeBatch(db, { batchId: run.id, goodQty: 5, rejectQty: 1, actor: "owner@example.com" }), { ok: true });
  const again = await completeBatch(db, { batchId: run.id, goodQty: 5, rejectQty: 1, actor: "owner@example.com" });
  assert.equal(again.ok, false, "a second click changes nothing");

  assert.deepEqual(await stockOf(db, product.id), { onHand: 6, reserved: 0 });
  const [drawn] = await db.select().from(schema.materials).where(eq(schema.materials.id, resin.id));
  assert.equal(Number(drawn.onHand), 1000 - 60 * 1.1 * 6, "rejects used material too");
  const [ran] = await db.select().from(schema.printers).where(eq(schema.printers.id, printer.id));
  assert.equal(Number(ran.totalPrintHours), 136);
  assert.equal((await db.select().from(schema.stockMovements)).length, 1);
});

test("editions number on from the last batch", async () => {
  const product = await addProduct(db, { handle: "strata-gallery-tray", editionSize: 50 });
  const first = await batch(product.id, "B-0001");
  const second = await batch(product.id, "B-0002");
  await completeBatch(db, { batchId: first.id, goodQty: 4, rejectQty: 0, actor: "owner" });
  await completeBatch(db, { batchId: second.id, goodQty: 3, rejectQty: 2, actor: "owner" });
  const rows = await db.select().from(schema.productionBatches);
  const byCode = Object.fromEntries(rows.map((row) => [row.code, [row.editionStart, row.editionEnd]]));
  assert.deepEqual(byCode, { "B-0001": [1, 4], "B-0002": [5, 7] });
});

test("a cancelled batch can't post stock", async () => {
  const product = await addProduct(db, { handle: "axis-desk-caddy" });
  const run = await batch(product.id, "B-0009");
  await db.update(schema.productionBatches).set({ status: "cancelled" }).where(eq(schema.productionBatches.id, run.id));
  assert.equal((await completeBatch(db, { batchId: run.id, goodQty: 3, rejectQty: 0, actor: "owner" })).ok, false);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 0, reserved: 0 });
});

test("manual counts can't go below zero or below what checkouts hold", async () => {
  const product = await addProduct(db, { handle: "tidal-mosaic-catchall" }, 2);
  await db.update(schema.productStock).set({ reserved: 1 }).where(eq(schema.productStock.productId, product.id));
  assert.equal((await adjustStock(db, { productId: product.id, delta: -2, actor: "owner", note: "count" })).ok, false);
  assert.deepEqual(await adjustStock(db, { productId: product.id, delta: -1, actor: "owner", note: "count" }), { ok: true });
  assert.deepEqual(await stockOf(db, product.id), { onHand: 1, reserved: 1 });
});

test("a returned piece goes back on the shelf once per order", async () => {
  const product = await addProduct(db, { handle: "solstice-countertop-vessel" }, 0);
  const orderId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(await restockReturn(db, { orderId, productId: product.id, quantity: 1, actor: "owner" }), { ok: true });
  assert.equal((await restockReturn(db, { orderId, productId: product.id, quantity: 1, actor: "owner" })).ok, false);
  assert.deepEqual(await stockOf(db, product.id), { onHand: 1, reserved: 0 });
});
