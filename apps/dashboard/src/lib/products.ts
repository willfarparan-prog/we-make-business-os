import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { materials, productMaterials, productStock, products } from "@/db/schema";
import { costPerPiece, num, type CostBreakdown } from "@/lib/costing";
import type { Settings } from "@/lib/settings";

export type ProductRow = typeof products.$inferSelect;

export type ProductWithStock = ProductRow & {
  onHand: number;
  reserved: number;
  available: number;
  lowThreshold: number;
  cost: CostBreakdown;
};

/** Every product with its stock and cost per piece, in catalog order. */
export async function productsWithStock(db: Database, settings: Pick<Settings, "laborRateCents" | "machineRateCents">): Promise<ProductWithStock[]> {
  const [rows, bom] = await Promise.all([
    db
      .select({ product: products, stock: productStock })
      .from(products)
      .leftJoin(productStock, eq(productStock.productId, products.id))
      .orderBy(asc(products.sortOrder), asc(products.name)),
    db
      .select({ productId: productMaterials.productId, qtyPerPiece: productMaterials.qtyPerPiece, wasteFactor: productMaterials.wasteFactor, costPerUnitCents: materials.costPerUnitCents })
      .from(productMaterials)
      .innerJoin(materials, eq(materials.id, productMaterials.materialId)),
  ]);
  const bomByProduct = new Map<string, typeof bom>();
  for (const line of bom) bomByProduct.set(line.productId, [...(bomByProduct.get(line.productId) ?? []), line]);

  return rows.map(({ product, stock }) => {
    const onHand = stock?.onHand ?? 0;
    const reserved = stock?.reserved ?? 0;
    return {
      ...product,
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      lowThreshold: stock?.lowThreshold ?? 2,
      cost: costPerPiece(
        {
          printHours: num(product.printHours),
          laborMinutes: product.laborMinutes,
          bom: (bomByProduct.get(product.id) ?? []).map((line) => ({ qtyPerPiece: num(line.qtyPerPiece), wasteFactor: num(line.wasteFactor), costPerUnitCents: num(line.costPerUnitCents) })),
        },
        settings,
      ),
    };
  });
}

/** Handles are what the storefront and Stripe use to name a product: lowercase words joined by hyphens. */
export function toHandle(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const HANDLE = /^[a-z0-9][a-z0-9-]{0,79}$/;
