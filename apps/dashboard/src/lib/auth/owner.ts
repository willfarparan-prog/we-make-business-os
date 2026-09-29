import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { isVerifiedOwner } from "./policy";

/**
 * Local preview without signing in: only under `next dev` AND with
 * WM_DEV_PREVIEW=1. Production builds always run with NODE_ENV=production,
 * so this can never apply there.
 */
export const devPreview = process.env.NODE_ENV === "development" && process.env.WM_DEV_PREVIEW === "1";

export type Viewer = { email: string; name?: string };

const ownerEmail = () => process.env.WM_OWNER_EMAIL?.trim().toLowerCase() || null;

/** The signed-in, verified owner, or null for anyone else. */
export async function getOwner(): Promise<Viewer | null> {
  const owner = ownerEmail();
  if (devPreview) return owner ? { email: owner, name: "Preview" } : null;
  const { data: session } = await auth.getSession();
  const email = session?.user?.email?.toLowerCase();
  if (!isVerifiedOwner(email, session?.user?.emailVerified, owner)) return null;
  return { email: email!, name: session?.user?.name ?? undefined };
}

/** For owner pages and actions: signed-out viewers go to sign-in, anyone else to /unauthorized. */
export async function requireOwner(): Promise<Viewer> {
  if (!devPreview) {
    const { data: session } = await auth.getSession();
    if (!session?.user) redirect("/auth/sign-in");
  }
  const viewer = await getOwner();
  if (!viewer) redirect("/unauthorized");
  return viewer;
}
