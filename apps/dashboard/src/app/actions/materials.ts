"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { atomic, requireDatabase } from "@/db";
import { MATERIAL_KINDS, materialMovements, materials } from "@/db/schema";
import { requireOwner } from "@/lib/auth/owner";
import { back, decimal, id, text } from "@/lib/forms";
import { recordAudit } from "@/lib/operations/audit";

function materialValues(form: FormData) {
  const kind = text(form, "kind", 30);
  return {
    name: text(form, "name", 120),
    sku: text(form, "sku", 40) || null,
    kind: (MATERIAL_KINDS as readonly string[]).includes(kind) ? kind : "other",
    unit: text(form, "unit", 20) || "g",
    reorderPoint: decimal(form, "reorderPoint") ?? "0",
    reorderQty: decimal(form, "reorderQty") ?? "0",
    costPerUnitCents: decimal(form, "costPerUnitCents") ?? "0",
    supplier: text(form, "supplier", 120) || null,
    notes: text(form, "notes", 1000) || null,
  };
}

export async function createMaterialAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const values = materialValues(form);
  if (!values.name) back("/materials", { error: "Give the material a name." });
  const onHand = decimal(form, "onHand") ?? "0";
  const inserted = await db.insert(materials).values({ ...values, onHand }).onConflictDoNothing().returning();
  if (!inserted.length) back("/materials", { error: `Another material already uses the SKU “${values.sku}”.` });
  if (Number(onHand) !== 0) await db.insert(materialMovements).values({ materialId: inserted[0].id, delta: onHand, reason: "opening", actor: viewer.email });
  await recordAudit(db, { actorEmail: viewer.email, action: "material.created", entityType: "material", entityId: inserted[0].id, summary: `Added ${values.name}` });
  revalidatePath("/materials");
  back("/materials", { notice: `${values.name} added.` });
}

export async function updateMaterialAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const materialId = id(form);
  if (!materialId) back("/materials", { error: "That material couldn't be found." });
  const values = materialValues(form);
  if (!values.name) back(`/materials/${materialId}`, { error: "Give the material a name." });
  if (values.sku) {
    const [clash] = await db.select({ id: materials.id }).from(materials).where(and(eq(materials.sku, values.sku), sql`${materials.id} <> ${materialId}`)).limit(1);
    if (clash) back(`/materials/${materialId}`, { error: `Another material already uses the SKU “${values.sku}”.` });
  }
  await db.update(materials).set({ ...values, updatedAt: sql`now()` }).where(eq(materials.id, materialId));
  await recordAudit(db, { actorEmail: viewer.email, action: "material.updated", entityType: "material", entityId: materialId, summary: `Updated ${values.name}`, metadata: { costPerUnitCents: values.costPerUnitCents } });
  back(`/materials/${materialId}`, { notice: "Saved. Costs per piece update everywhere." });
}

/** Receiving a delivery (positive) or writing off spoiled stock (negative). */
export async function moveMaterialAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const materialId = id(form);
  const delta = decimal(form, "delta");
  const returnTo = text(form, "returnTo", 100) === "list" ? "/materials" : `/materials/${materialId}`;
  if (!materialId || !delta || Number(delta) === 0) back(returnTo, { error: "Enter an amount, like 1000 or -50." });
  const reason = Number(delta) > 0 ? "received" : "write_off";
  await atomic(db, [
    sql`update materials set on_hand = on_hand + ${delta}::numeric, updated_at = now() where id = ${materialId}::uuid`,
    sql`insert into material_movements (material_id, delta, reason, actor, note) values (${materialId}::uuid, ${delta}::numeric, ${reason}, ${viewer.email}, ${text(form, "note", 200) || null})`,
  ]);
  back(returnTo, { notice: reason === "received" ? "Delivery received." : "Written off." });
}
