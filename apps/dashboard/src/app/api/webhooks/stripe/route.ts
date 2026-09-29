import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { webhookEvents } from "@/db/schema";
import { applyStripeEvent } from "@/lib/orders/stripe-events";

/*
 * Stripe → orders, stock and the ledger. The raw event is saved first, so a
 * handler problem can be replayed; Stripe gets a 500 on a handler failure and
 * retries, which is safe because every step is idempotent.
 */
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secretKey || !webhookSecret || !signature) return Response.json({ error: "Stripe is not configured." }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = new Stripe(secretKey).webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const db = getDatabase();
  if (!db) return Response.json({ error: "Database unavailable." }, { status: 503 });

  await db
    .insert(webhookEvents)
    .values({ provider: "stripe", providerEventId: event.id, eventType: event.type, payload: event as unknown as Record<string, unknown> })
    .onConflictDoNothing();

  try {
    const result = await applyStripeEvent(db, event);
    await db
      .update(webhookEvents)
      .set({ processed: result.handled, processedAt: sql`now()`, error: result.handled ? null : result.note ?? null })
      .where(eq(webhookEvents.providerEventId, event.id));
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe] handler failed", event.type, event.id, error);
    await db
      .update(webhookEvents)
      .set({ error: error instanceof Error ? error.message.slice(0, 500) : "Handler failed" })
      .where(eq(webhookEvents.providerEventId, event.id));
    return Response.json({ error: "Handler failed; Stripe will retry." }, { status: 500 });
  }
}
