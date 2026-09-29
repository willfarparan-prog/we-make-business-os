import { getDatabase } from "@/db";
import { unsubscribeByToken } from "@/lib/contacts";

/** One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = getDatabase();
  if (!db) return Response.json({ error: "Unavailable" }, { status: 503 });
  await unsubscribeByToken(db, (await params).token);
  // Unknown tokens get the same answer, so the endpoint can't be used to probe the list.
  return Response.json({ ok: true });
}
