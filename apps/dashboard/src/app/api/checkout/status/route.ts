import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { orders } from "@/db/schema";
import { corsHeaders } from "@/lib/site-origins";

/**
 * For the storefront's thank-you page: the order number and whether it's paid.
 * Keyed by the unguessable Checkout Session id; returns nothing personal.
 */
export async function GET(request: Request) {
  const headers = { ...corsHeaders(request.headers.get("origin"), "GET, OPTIONS"), "Cache-Control": "no-store" };
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  const db = getDatabase();
  if (!db || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return Response.json({ found: false }, { status: 404, headers });
  const [order] = await db.select({ number: orders.number, status: orders.status }).from(orders).where(eq(orders.checkoutSessionId, sessionId)).limit(1);
  if (!order) return Response.json({ found: false }, { status: 404, headers });
  return Response.json({ found: true, number: `WM-${order.number}`, paid: !["pending", "expired", "cancelled"].includes(order.status) }, { headers });
}
