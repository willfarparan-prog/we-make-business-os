"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDatabase } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireOwner } from "@/lib/auth/owner";
import { recordActivity } from "@/lib/contacts";
import { back, id, int, text } from "@/lib/forms";
import { restockReturn } from "@/lib/inventory";
import { releaseOrder } from "@/lib/orders/checkout";
import { recordAudit } from "@/lib/operations/audit";

/** Fulfilment moves forward one step at a time: paid → packed → shipped → delivered. */
const NEXT: Record<string, { to: "packed" | "shipped" | "delivered"; stamp: "packedAt" | "shippedAt" | "deliveredAt" }> = {
  paid: { to: "packed", stamp: "packedAt" },
  packed: { to: "shipped", stamp: "shippedAt" },
  shipped: { to: "delivered", stamp: "deliveredAt" },
};

export async function advanceOrderAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const orderId = id(form);
  if (!orderId) back("/orders", { error: "That order couldn't be found." });
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) back("/orders", { error: "That order couldn't be found." });
  const step = NEXT[order.status];
  if (!step) back(`/orders/${orderId}`, { error: `A ${order.status} order has no next step.` });

  const carrier = text(form, "carrier", 60) || null;
  const trackingNumber = text(form, "trackingNumber", 80) || null;
  if (step.to === "shipped" && !trackingNumber) back(`/orders/${orderId}`, { error: "Add the tracking number before marking it shipped." });

  const moved = await db
    .update(orders)
    .set({ status: step.to, [step.stamp]: sql`now()`, ...(step.to === "shipped" ? { carrier, trackingNumber } : {}), updatedAt: sql`now()` })
    .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (!moved.length) back(`/orders/${orderId}`, { error: "Someone else changed this order. Refresh and try again." });

  await recordAudit(db, { actorEmail: viewer.email, action: `order.${step.to}`, entityType: "order", entityId: orderId, summary: `WM-${order.number} ${step.to}`, metadata: { carrier, trackingNumber } });
  if (order.contactId) await recordActivity(db, order.contactId, `order_${step.to}`, `Order WM-${order.number} ${step.to}${trackingNumber ? ` (${carrier ?? ""} ${trackingNumber})` : ""}`);
  revalidatePath("/orders");
  back(`/orders/${orderId}`, { notice: `Marked ${step.to}.` });
}

export async function saveOrderNotesAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const orderId = id(form);
  if (!orderId) back("/orders", { error: "That order couldn't be found." });
  await db.update(orders).set({ notes: text(form, "notes", 2000) || null, updatedAt: sql`now()` }).where(eq(orders.id, orderId));
  back(`/orders/${orderId}`, { notice: "Notes saved." });
}

export async function saveEditionNoteAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const orderId = id(form);
  const itemId = id(form, "itemId");
  if (!orderId || !itemId) back("/orders", { error: "That item couldn't be found." });
  await db.update(orderItems).set({ editionNote: text(form, "editionNote", 120) || null }).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
  back(`/orders/${orderId}`, { notice: "Edition noted." });
}

/** Closes a checkout that never finished, giving back any pieces it held. */
export async function cancelPendingOrderAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const orderId = id(form);
  if (!orderId) back("/orders", { error: "That order couldn't be found." });
  await releaseOrder(db, orderId, "cancelled");
  await recordAudit(db, { actorEmail: viewer.email, action: "order.cancelled", entityType: "order", entityId: orderId, summary: "Closed an unfinished checkout" });
  back(`/orders/${orderId}`, { notice: "Checkout closed; any held pieces are back in stock." });
}

export async function restockAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const orderId = id(form);
  const productId = id(form, "productId");
  const quantity = int(form, "quantity");
  if (!orderId || !productId || quantity === null) back("/orders", { error: "That item couldn't be found." });
  const result = await restockReturn(db, { orderId, productId, quantity, actor: viewer.email });
  if (!result.ok) back(`/orders/${orderId}`, { error: result.message });
  await recordAudit(db, { actorEmail: viewer.email, action: "stock.restocked", entityType: "order", entityId: orderId, summary: `Restocked ${quantity} returned piece(s)`, metadata: { productId, quantity } });
  back(`/orders/${orderId}`, { notice: "Back in stock." });
}
