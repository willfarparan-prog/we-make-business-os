"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDatabase } from "@/db";
import { productMaterials, productStock, products, PRODUCT_STATUSES } from "@/db/schema";
import type { ProductFields } from "@/lib/assistant/shape";
import { requireOwner } from "@/lib/auth/owner";
import { back, checked, decimal, id, int, isUuid, text } from "@/lib/forms";
import { adjustStock } from "@/lib/inventory";
import { parseDollars } from "@/lib/money";
import { recordAudit } from "@/lib/operations/audit";
import { HANDLE, toHandle } from "@/lib/products";

function productValues(form: FormData) {
  const name = text(form, "name", 120);
  const priceCents = parseDollars(text(form, "price", 20));
  const status = text(form, "status", 20);
  return {
    name,
    handle: text(form, "handle", 80) || toHandle(name),
    category: text(form, "category", 60),
    material: text(form, "material", 160),
    note: text(form, "note", 600),
    priceCents,
    status: (PRODUCT_STATUSES as readonly string[]).includes(status) ? status : "draft",
    image: text(form, "image", 500),
    sortOrder: int(form, "sortOrder") ?? 0,
    madeToOrder: checked(form, "madeToOrder"),
    leadTime: text(form, "leadTime", 120),
    editionSize: int(form, "editionSize"),
    printHours: decimal(form, "printHours") ?? "0",
    laborMinutes: int(form, "laborMinutes") ?? 0,
  };
}

function problem(values: ReturnType<typeof productValues>) {
  if (!values.name) return "Give the product a name.";
  if (!HANDLE.test(values.handle)) return "The handle can only use lowercase letters, numbers and hyphens.";
  if (!values.category) return "Choose a category.";
  if (values.priceCents === null) return "Enter a price in dollars, like 118 or 118.50.";
  if (values.image && !/^(\/|https:\/\/)/.test(values.image)) return "The image must be a site path starting with / or an https:// link.";
  if (values.editionSize !== null && values.editionSize <= 0) return "An edition size must be at least 1, or left blank.";
  return null;
}

export async function createProductAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const values = productValues(form);
  const error = problem(values);
  if (error) back("/products/new", { error });
  const [clash] = await db.select({ id: products.id }).from(products).where(eq(products.handle, values.handle)).limit(1);
  if (clash) back("/products/new", { error: `Another product already uses the handle “${values.handle}”.` });
  const [product] = await db.insert(products).values({ ...values, priceCents: values.priceCents!, leadTime: values.leadTime || "Made to order in 2–3 weeks." }).returning();
  await db.insert(productStock).values({ productId: product.id }).onConflictDoNothing();
  await recordAudit(db, { actorEmail: viewer.email, action: "product.created", entityType: "product", entityId: product.id, summary: `Added ${product.name}`, metadata: { status: product.status } });
  revalidatePath("/products");
  back(`/products/${product.id}`, { notice: values.status === "active" ? "Product added. It's live on the storefront within a minute." : "Product added as a draft." });
}

export async function updateProductAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const productId = id(form);
  if (!productId) back("/products", { error: "That product couldn't be found." });
  const values = productValues(form);
  const error = problem(values);
  if (error) back(`/products/${productId}`, { error });
  const [clash] = await db.select({ id: products.id }).from(products).where(and(eq(products.handle, values.handle), sql`${products.id} <> ${productId}`)).limit(1);
  if (clash) back(`/products/${productId}`, { error: `Another product already uses the handle “${values.handle}”.` });
  const [before] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!before) back("/products", { error: "That product couldn't be found." });
  await db.update(products).set({ ...values, priceCents: values.priceCents!, leadTime: values.leadTime || before.leadTime, updatedAt: sql`now()` }).where(eq(products.id, productId));
  await recordAudit(db, {
    actorEmail: viewer.email, action: "product.updated", entityType: "product", entityId: productId, summary: `Updated ${values.name}`,
    metadata: { priceBefore: before.priceCents, priceAfter: values.priceCents, statusBefore: before.status, statusAfter: values.status },
  });
  revalidatePath("/products");
  back(`/products/${productId}`, { notice: "Saved. The storefront picks up changes within a minute." });
}

export async function adjustStockAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const productId = id(form);
  const delta = int(form, "delta");
  if (!productId || delta === null) back(`/products/${productId ?? ""}`, { error: "Enter a whole number, like 3 or -1." });
  const note = text(form, "note", 200);
  const result = await adjustStock(db, { productId, delta, actor: viewer.email, note });
  if (!result.ok) back(`/products/${productId}`, { error: result.message });
  await recordAudit(db, { actorEmail: viewer.email, action: "stock.adjusted", entityType: "product", entityId: productId, summary: `Stock ${delta > 0 ? "+" : ""}${delta}${note ? ` (${note})` : ""}`, metadata: { delta } });
  back(`/products/${productId}`, { notice: `Stock ${delta > 0 ? "added" : "removed"}.` });
}

export async function saveThresholdAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const productId = id(form);
  const threshold = int(form, "lowThreshold");
  if (!productId || threshold === null || threshold < 0) back(`/products/${productId ?? ""}`, { error: "Enter a whole number for the low-stock alert." });
  await db.update(productStock).set({ lowThreshold: threshold, updatedAt: sql`now()` }).where(eq(productStock.productId, productId));
  back(`/products/${productId}`, { notice: "Low-stock alert saved." });
}

export async function setBomLineAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const productId = id(form);
  const materialId = id(form, "materialId");
  const qty = decimal(form, "qtyPerPiece");
  const waste = decimal(form, "wasteFactor") ?? "1.1";
  if (!productId || !materialId || !qty || Number(qty) <= 0 || Number(waste) < 1) back(`/products/${productId ?? ""}`, { error: "Pick a material and a quantity above zero; waste is 1 or more (1.1 = 10% extra)." });
  await db
    .insert(productMaterials)
    .values({ productId, materialId, qtyPerPiece: qty, wasteFactor: waste })
    .onConflictDoUpdate({ target: [productMaterials.productId, productMaterials.materialId], set: { qtyPerPiece: qty, wasteFactor: waste } });
  await recordAudit(db, { actorEmail: viewer.email, action: "bom.updated", entityType: "product", entityId: productId, summary: "Updated materials per piece", metadata: { materialId, qty } });
  back(`/products/${productId}`, { notice: "Materials per piece updated." });
}

export async function removeBomLineAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const productId = id(form);
  const materialId = id(form, "materialId");
  if (!productId || !materialId) back("/products", { error: "That line couldn't be found." });
  await db.delete(productMaterials).where(and(eq(productMaterials.productId, productId), eq(productMaterials.materialId, materialId)));
  back(`/products/${productId}`, { notice: "Material removed from this product." });
}

/** The assistant's Apply button. Returns a result instead of redirecting, since it's called from the chat panel. */
export async function applyProductCopyAction(productId: string, fields: ProductFields) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  if (!isUuid(productId)) return { ok: false, message: "That product couldn't be found." };
  const name = fields.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "A product needs a name." };
  const updated = await db
    .update(products)
    .set({ name, material: fields.material.trim().slice(0, 160), note: fields.note.trim().slice(0, 600), updatedAt: sql`now()` })
    .where(eq(products.id, productId))
    .returning({ id: products.id });
  if (!updated.length) return { ok: false, message: "That product couldn't be found." };
  await recordAudit(db, { actorEmail: viewer.email, action: "product.copy_applied", entityType: "product", entityId: productId, summary: `Applied assistant copy to ${name}` });
  revalidatePath(`/products/${productId}`);
  return { ok: true, message: "Applied." };
}
