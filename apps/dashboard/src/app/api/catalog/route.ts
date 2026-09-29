import { getDatabase } from "@/db";
import { publicCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { corsHeaders } from "@/lib/site-origins";

/** What the storefront renders. Cached at the edge for a minute; Stripe always charges the live price. */
export async function GET(request: Request) {
  const headers = { ...corsHeaders(request.headers.get("origin"), "GET, OPTIONS"), "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" };
  const db = getDatabase();
  if (!db) return Response.json({ error: "The catalog isn't connected yet." }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  const catalog = await publicCatalog(db, await getSettings(db));
  return Response.json(catalog, { headers });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), "GET, OPTIONS") });
}
