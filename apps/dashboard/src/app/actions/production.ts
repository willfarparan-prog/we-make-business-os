"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDatabase } from "@/db";
import { BATCH_STATUSES, BATCH_STEPS, batchSteps, productionBatches } from "@/db/schema";
import { requireOwner } from "@/lib/auth/owner";
import { back, checked, id, int, text } from "@/lib/forms";
import { completeBatch } from "@/lib/inventory";
import { recordAudit } from "@/lib/operations/audit";

export async function createBatchAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const productId = id(form, "productId");
  const plannedQty = int(form, "plannedQty");
  const printerId = id(form, "printerId");
  if (!productId || plannedQty === null || plannedQty <= 0) back("/production", { error: "Pick a product and how many pieces to make." });
  const [{ next }] = (await db.execute(sql`select count(*)::int + 1 as next from production_batches`)).rows as Array<{ next: number }>;
  const code = `B-${String(next).padStart(4, "0")}`;
  const [batch] = await db
    .insert(productionBatches)
    .values({ code, productId, plannedQty, printerId, notes: text(form, "notes", 1000) || null })
    .returning();
  await db.insert(batchSteps).values(BATCH_STEPS.map((step) => ({ batchId: batch.id, step })));
  await recordAudit(db, { actorEmail: viewer.email, action: "batch.created", entityType: "batch", entityId: batch.id, summary: `Planned ${code}: ${plannedQty} pieces`, metadata: { productId } });
  revalidatePath("/production");
  back(`/production/${batch.id}`, { notice: `Batch ${code} planned.` });
}

export async function setBatchStatusAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const batchId = id(form);
  const status = text(form, "status", 20);
  if (!batchId || !(BATCH_STATUSES as readonly string[]).includes(status) || status === "completed") back("/production", { error: "Use Complete batch to finish a batch." });
  const updated = await db
    .update(productionBatches)
    .set({ status, startedAt: status === "planned" ? null : sql`coalesce(${productionBatches.startedAt}, now())`, updatedAt: sql`now()` })
    .where(and(eq(productionBatches.id, batchId), sql`${productionBatches.status} not in ('completed', 'cancelled')`))
    .returning({ code: productionBatches.code });
  if (!updated.length) back(`/production/${batchId}`, { error: "A completed or cancelled batch can't change stage." });
  await recordAudit(db, { actorEmail: viewer.email, action: "batch.stage", entityType: "batch", entityId: batchId, summary: `${updated[0].code} → ${status}` });
  back(`/production/${batchId}`, { notice: `Moved to ${status}.` });
}

export async function toggleStepAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const batchId = id(form);
  const stepId = id(form, "stepId");
  if (!batchId || !stepId) back("/production", { error: "That step couldn't be found." });
  const done = checked(form, "done");
  await db
    .update(batchSteps)
    .set({ done, doneAt: done ? sql`now()` : null, minutes: int(form, "minutes"), notes: text(form, "notes", 300) || null })
    .where(and(eq(batchSteps.id, stepId), eq(batchSteps.batchId, batchId)));
  back(`/production/${batchId}`, { notice: "Step updated." });
}

export async function completeBatchAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const batchId = id(form);
  const goodQty = int(form, "goodQty");
  const rejectQty = int(form, "rejectQty") ?? 0;
  if (!batchId || goodQty === null) back("/production", { error: "Enter how many good pieces came out of the batch." });
  const result = await completeBatch(db, { batchId, goodQty, rejectQty, actor: viewer.email });
  if (!result.ok) back(`/production/${batchId}`, { error: result.message });
  await recordAudit(db, { actorEmail: viewer.email, action: "batch.completed", entityType: "batch", entityId: batchId, summary: `Completed: ${goodQty} good, ${rejectQty} rejected`, metadata: { goodQty, rejectQty } });
  revalidatePath("/production");
  revalidatePath("/products");
  back(`/production/${batchId}`, { notice: `${goodQty} piece${goodQty === 1 ? "" : "s"} added to stock.` });
}

export async function cancelBatchAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const batchId = id(form);
  if (!batchId) back("/production", { error: "That batch couldn't be found." });
  const updated = await db
    .update(productionBatches)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(and(eq(productionBatches.id, batchId), sql`${productionBatches.status} not in ('completed', 'cancelled')`))
    .returning({ code: productionBatches.code });
  if (!updated.length) back(`/production/${batchId}`, { error: "This batch is already finished." });
  await recordAudit(db, { actorEmail: viewer.email, action: "batch.cancelled", entityType: "batch", entityId: batchId, summary: `Cancelled ${updated[0].code}` });
  back(`/production/${batchId}`, { notice: "Batch cancelled." });
}
