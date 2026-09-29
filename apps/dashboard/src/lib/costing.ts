/*
 * Cost of goods for one finished piece:
 *
 *   materials  Σ qty per piece × waste factor × cost per unit
 *   machine    print hours × machine rate
 *   labor      finishing minutes × labor rate
 *
 * Pure, so the product page, the overview and the tests all agree.
 */

export type BomLine = { qtyPerPiece: number; wasteFactor: number; costPerUnitCents: number };
export type CostRates = { laborRateCents: number; machineRateCents: number };
export type CostBreakdown = { materialsCents: number; machineCents: number; laborCents: number; totalCents: number };

export function costPerPiece(input: { printHours: number; laborMinutes: number; bom: BomLine[] }, rates: CostRates): CostBreakdown {
  const materials = input.bom.reduce((sum, line) => sum + line.qtyPerPiece * line.wasteFactor * line.costPerUnitCents, 0);
  const machine = input.printHours * rates.machineRateCents;
  const labor = (input.laborMinutes / 60) * rates.laborRateCents;
  return {
    materialsCents: Math.round(materials),
    machineCents: Math.round(machine),
    laborCents: Math.round(labor),
    totalCents: Math.round(materials + machine + labor),
  };
}

/** Gross margin as a fraction of price (0.62 = 62%), or null when the price is zero. */
export function marginOf(priceCents: number, costCents: number) {
  return priceCents > 0 ? (priceCents - costCents) / priceCents : null;
}

/** Numeric columns arrive as strings; anything unparseable counts as zero. */
export function num(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
