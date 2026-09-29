"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDatabase } from "@/db";
import { PRINTER_STATUSES, maintenanceLogs, printers } from "@/db/schema";
import { requireOwner } from "@/lib/auth/owner";
import { back, decimal, id, text } from "@/lib/forms";
import { parseDollars } from "@/lib/money";
import { recordAudit } from "@/lib/operations/audit";

function status(form: FormData) {
  const value = text(form, "status", 20);
  return (PRINTER_STATUSES as readonly string[]).includes(value) ? value : "idle";
}

export async function createPrinterAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const name = text(form, "name", 80);
  if (!name) back("/printers", { error: "Give the printer a name." });
  const [printer] = await db
    .insert(printers)
    .values({ name, model: text(form, "model", 120), status: status(form), totalPrintHours: decimal(form, "totalPrintHours") ?? "0", notes: text(form, "notes", 1000) || null })
    .returning();
  await recordAudit(db, { actorEmail: viewer.email, action: "printer.created", entityType: "printer", entityId: printer.id, summary: `Added ${name}` });
  revalidatePath("/printers");
  back(`/printers/${printer.id}`, { notice: `${name} added.` });
}

export async function updatePrinterAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const printerId = id(form);
  const name = text(form, "name", 80);
  if (!printerId || !name) back("/printers", { error: "Give the printer a name." });
  await db
    .update(printers)
    .set({ name, model: text(form, "model", 120), status: status(form), totalPrintHours: decimal(form, "totalPrintHours") ?? "0", notes: text(form, "notes", 1000) || null, updatedAt: sql`now()` })
    .where(eq(printers.id, printerId));
  await recordAudit(db, { actorEmail: viewer.email, action: "printer.updated", entityType: "printer", entityId: printerId, summary: `Updated ${name}`, metadata: { status: status(form) } });
  back(`/printers/${printerId}`, { notice: "Saved." });
}

export async function logMaintenanceAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const printerId = id(form);
  const kind = text(form, "kind", 80);
  if (!printerId || !kind) back(`/printers/${printerId ?? ""}`, { error: "Say what was done (nozzle swap, belt tension, bed level…)." });
  const [printer] = await db.select().from(printers).where(eq(printers.id, printerId)).limit(1);
  if (!printer) back("/printers", { error: "That printer couldn't be found." });
  const everyHours = decimal(form, "everyHours");
  const hoursAt = printer.totalPrintHours;
  await db.insert(maintenanceLogs).values({
    printerId,
    kind,
    hoursAt,
    costCents: parseDollars(text(form, "cost", 20)) ?? 0,
    nextDueHours: everyHours ? String(Number(hoursAt) + Number(everyHours)) : null,
    notes: text(form, "notes", 1000) || null,
  });
  await recordAudit(db, { actorEmail: viewer.email, action: "printer.maintained", entityType: "printer", entityId: printerId, summary: `${printer.name}: ${kind}` });
  back(`/printers/${printerId}`, { notice: "Maintenance logged." });
}
