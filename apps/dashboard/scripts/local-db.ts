/**
 * Local sandbox database (PGlite, an in-process Postgres) for trying the
 * dashboard and the storefront together without touching live data.
 *
 *   pnpm db:local            create .local-db with sample data (or top it up)
 *   pnpm db:local --reset    delete it and start over
 *
 * Then run the dashboard against it:
 *   WM_LOCAL_DB=.local-db WM_DEV_PREVIEW=1 WM_OWNER_EMAIL=you@example.com next dev --port 3100
 *
 * Stop the dev server first: PGlite allows one process at a time.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import * as schema from "../src/db/schema";
import { LAUNCH_PRODUCTS } from "../src/lib/seed-products";

const dir = path.resolve(process.argv.find((arg) => arg.startsWith("--dir="))?.slice(6) ?? ".local-db");
const reset = process.argv.includes("--reset");

export async function openSandbox(directory?: string, options: { push?: boolean } = {}) {
  const client = new PGlite(directory);
  const db = drizzle({ client, schema });
  // drizzle-kit's push can exit the process silently when it wants to ask a
  // question about existing tables, so an existing sandbox is only topped up.
  if (options.push === false) return { client, db };
  const { apply, hasDataLoss, warnings } = await pushSchema(schema, db as never);
  if (hasDataLoss) throw new Error(`Refusing to change the sandbox schema with data loss: ${warnings.join("; ")}`);
  await apply();
  return { client, db };
}

/** Placeholder materials so costs and margins have something to show. Replace with real ones in the dashboard. */
const SAMPLE_MATERIALS = [
  { sku: "FIL-WOOD", name: "Wood-fill PLA filament", kind: "filament", unit: "g", onHand: "2400", reorderPoint: "1000", reorderQty: "3000", costPerUnitCents: "3.2", supplier: "Sample supplier" },
  { sku: "FIL-PETG", name: "PETG filament, ivory", kind: "filament", unit: "g", onHand: "1800", reorderPoint: "800", reorderQty: "2000", costPerUnitCents: "2.4", supplier: "Sample supplier" },
  { sku: "RES-EPOXY", name: "Epoxy casting resin", kind: "resin", unit: "ml", onHand: "900", reorderPoint: "1000", reorderQty: "2000", costPerUnitCents: "5.5", supplier: "Sample supplier" },
  { sku: "PIG-TURQ", name: "Turquoise resin pigment", kind: "pigment", unit: "g", onHand: "60", reorderPoint: "20", reorderQty: "50", costPerUnitCents: "20", supplier: "Sample supplier" },
  { sku: "PETG-WIN", name: "Clear PETG sheet 0.5 mm", kind: "sheet", unit: "sheet", onHand: "14", reorderPoint: "5", reorderQty: "20", costPerUnitCents: "150", supplier: "Sample supplier" },
  { sku: "BOX-GIFT", name: "Gift box + tissue", kind: "packaging", unit: "pc", onHand: "25", reorderPoint: "10", reorderQty: "50", costPerUnitCents: "180", supplier: "Sample supplier" },
];

async function main() {
  if (reset && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  const existing = existsSync(dir);
  if (existing) console.log(`${dir} already exists: topping up its data. After a schema change, run with --reset.`);
  const { client, db } = await openSandbox(dir, { push: !existing });

  for (const product of LAUNCH_PRODUCTS) {
    await db.insert(schema.products).values({ ...product, printHours: "6", laborMinutes: 45 }).onConflictDoNothing();
  }
  const products = await db.select().from(schema.products);
  for (const [index, product] of products.entries()) {
    await db.insert(schema.productStock).values({ productId: product.id, onHand: index % 3 === 0 ? 0 : 3 }).onConflictDoNothing();
  }
  for (const material of SAMPLE_MATERIALS) await db.insert(schema.materials).values({ ...material, notes: "Placeholder: replace with your real cost." }).onConflictDoNothing();
  const materials = await db.select().from(schema.materials);
  const bySku = new Map(materials.map((material) => [material.sku, material.id]));
  for (const product of products) {
    for (const [sku, qty] of [["FIL-WOOD", "180"], ["RES-EPOXY", "60"], ["PIG-TURQ", "2"], ["BOX-GIFT", "1"]] as const) {
      await db.insert(schema.productMaterials).values({ productId: product.id, materialId: bySku.get(sku)!, qtyPerPiece: qty, wasteFactor: sku === "BOX-GIFT" ? "1" : "1.1" }).onConflictDoNothing();
    }
  }
  if ((await db.$count(schema.printers)) === 0) {
    await db.insert(schema.printers).values([{ name: "Printer 1", model: "Sample model", totalPrintHours: "412" }, { name: "Printer 2", model: "Sample model", totalPrintHours: "96" }]);
  }
  for (const email of ["sample.subscriber@example.com", "sample.reader@example.com"]) {
    const [contact] = await db.insert(schema.contacts).values({ email, source: "Sandbox sample", tags: ["newsletter"] }).onConflictDoNothing().returning();
    if (contact) await db.insert(schema.consentRecords).values({ contactId: contact.id, granted: true, source: "Sandbox sample" });
  }

  console.log(`Sandbox ready at ${dir}`);
  console.log(`  products ${await db.$count(schema.products)} · materials ${await db.$count(schema.materials)} · printers ${await db.$count(schema.printers)} · contacts ${await db.$count(schema.contacts)}`);
  await client.close();
}

if (process.argv[1]?.endsWith("local-db.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
