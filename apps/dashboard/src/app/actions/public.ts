"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "@/db";
import { unsubscribeByToken } from "@/lib/contacts";

/** The unsubscribe page's button. Public: the token in the link is the permission. */
export async function unsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const db = getDatabase();
  if (db && token) await unsubscribeByToken(db, token);
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}
