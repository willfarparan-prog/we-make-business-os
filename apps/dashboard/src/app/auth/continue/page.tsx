import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";

export default async function AfterSignIn() {
  await requireOwner();
  redirect("/");
}
