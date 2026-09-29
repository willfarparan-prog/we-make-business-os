import { z } from "zod";
import { getDatabase } from "@/db";
import { normalizeEmail, subscribe } from "@/lib/contacts";
import { corsHeaders } from "@/lib/site-origins";

const input = z.object({
  email: z.string().max(254),
  firstName: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
  /** A field people can't see. Anything in it came from a bot. */
  company: z.string().max(200).optional(),
});

/**
 * "Notes from the studio" signups. Always answers ok for a well-formed email,
 * so the endpoint can't be used to learn who is already on the list.
 */
export async function POST(request: Request) {
  const headers = { ...corsHeaders(request.headers.get("origin"), "POST, OPTIONS"), "Cache-Control": "no-store" };
  const parsed = input.safeParse(await request.json().catch(() => null));
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!parsed.success || !email) return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400, headers });
  if (parsed.data.company) return Response.json({ ok: true }, { headers });

  const db = getDatabase();
  if (!db) return Response.json({ ok: false, error: "Signups are paused for a moment. Please try again soon." }, { status: 503, headers });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  await subscribe(db, { email, firstName: parsed.data.firstName, source: `Website: ${parsed.data.source?.trim() || "Notes from the studio"}`, ip });
  return Response.json({ ok: true }, { headers });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), "POST, OPTIONS") });
}
