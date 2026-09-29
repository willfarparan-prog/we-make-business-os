import assert from "node:assert/strict";
import { test } from "node:test";
import { costPerPiece, marginOf, num } from "@/lib/costing";
import { formatCents, parseDollars } from "@/lib/money";
import { shippingFor } from "@/lib/settings";

test("cost per piece adds materials with waste, machine time and labor", () => {
  const cost = costPerPiece(
    { printHours: 6, laborMinutes: 45, bom: [{ qtyPerPiece: 180, wasteFactor: 1.1, costPerUnitCents: 3.2 }, { qtyPerPiece: 60, wasteFactor: 1.1, costPerUnitCents: 5.5 }, { qtyPerPiece: 1, wasteFactor: 1, costPerUnitCents: 180 }] },
    { laborRateCents: 2500, machineRateCents: 150 },
  );
  // 180×1.1×3.2 = 633.6; 60×1.1×5.5 = 363; 180 → 1176.6 materials
  assert.deepEqual(cost, { materialsCents: 1177, machineCents: 900, laborCents: 1875, totalCents: 3952 });
  assert.equal(marginOf(11800, cost.totalCents)?.toFixed(3), "0.665");
  assert.equal(marginOf(0, 100), null);
});

test("numbers from numeric columns and money parsing", () => {
  assert.equal(num("12.50"), 12.5);
  assert.equal(num(null), 0);
  assert.equal(num("abc"), 0);
  assert.equal(parseDollars("$1,180.5"), 118050);
  assert.equal(parseDollars("12.345"), null);
  assert.equal(parseDollars("-4"), null);
  assert.equal(formatCents(11800), "$118");
  assert.equal(formatCents(1150), "$11.50");
  assert.equal(formatCents(-500), "−$5");
});

test("shipping is free at the threshold and flat below it", () => {
  const settings = { shippingFlatRateCents: 1200, shippingFreeOverCents: 25000 };
  assert.equal(shippingFor(24999, settings), 1200);
  assert.equal(shippingFor(25000, settings), 0);
});
