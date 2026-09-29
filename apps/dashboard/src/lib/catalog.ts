import "server-only";
import type { Database } from "@/db";
import { productsWithStock } from "@/lib/products";
import type { Settings } from "@/lib/settings";
import { absoluteImage } from "@/lib/urls";

/** The most a single line can hold, and the most availability the site is told about. */
export const MAX_LINE_QTY = 10;

export type CatalogProduct = {
  id: string;
  handle: string;
  name: string;
  category: string;
  material: string;
  note: string;
  /** Whole dollars, as the storefront has always shown them. */
  price: number;
  priceCents: number;
  image: string;
  available: boolean;
  availableQty: number;
  madeToOrder: boolean;
  leadTime: string;
  editionSize: number | null;
};

export type Catalog = {
  currency: "usd";
  updatedAt: string;
  shipping: { flatCents: number; freeOverCents: number };
  products: CatalogProduct[];
};

/** What the storefront renders: active products only, never costs or exact stock beyond the cap. */
export async function publicCatalog(db: Database, settings: Settings): Promise<Catalog> {
  const rows = await productsWithStock(db, settings);
  return {
    currency: "usd",
    updatedAt: new Date().toISOString(),
    shipping: { flatCents: settings.shippingFlatRateCents, freeOverCents: settings.shippingFreeOverCents },
    products: rows
      .filter((product) => product.status === "active")
      .map((product) => ({
        id: product.id,
        handle: product.handle,
        name: product.name,
        category: product.category,
        material: product.material,
        note: product.note,
        price: product.priceCents / 100,
        priceCents: product.priceCents,
        image: absoluteImage(product.image),
        available: product.madeToOrder || product.available > 0,
        availableQty: product.madeToOrder ? MAX_LINE_QTY : Math.min(MAX_LINE_QTY, product.available),
        madeToOrder: product.madeToOrder,
        leadTime: product.leadTime,
        editionSize: product.editionSize,
      })),
  };
}
