import { getDatabase } from "@/db";
import { startCheckout } from "@/lib/orders/checkout";
import { stripeClient } from "@/lib/payments/stripe";
import { corsHeaders } from "@/lib/site-origins";

/** The storefront's bag → a Stripe Checkout page. Prices come from the database, never the request. */
export async function POST(request: Request) {
  const headers = { ...corsHeaders(request.headers.get("origin"), "POST, OPTIONS"), "Cache-Control": "no-store" };
  const db = getDatabase();
  const stripe = stripeClient();
  if (!db || !stripe.ok) {
    return Response.json({ error: "Online checkout isn't open yet." }, { status: 503, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Your bag couldn't be read. Please refresh and try again." }, { status: 400, headers });
  }
  const result = await startCheckout(db, stripe.stripe, body);
  if (!result.ok) return Response.json({ error: result.error, unavailable: result.unavailable ?? [] }, { status: result.status, headers });
  return Response.json({ url: result.url, order: result.orderNumber }, { headers });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), "POST, OPTIONS") });
}
