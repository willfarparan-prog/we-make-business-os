"use server";

import { requireDatabase } from "@/db";
import { requireOwner } from "@/lib/auth/owner";
import { back, checked, text } from "@/lib/forms";
import { parseDollars } from "@/lib/money";
import { recordAudit } from "@/lib/operations/audit";
import { getSettings, saveSettings, type EmailMode } from "@/lib/settings";

export async function saveSettingsAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const before = await getSettings(db);
  const flat = parseDollars(text(form, "shippingFlatRate", 20));
  const freeOver = parseDollars(text(form, "shippingFreeOver", 20));
  const labor = parseDollars(text(form, "laborRate", 20));
  const machine = parseDollars(text(form, "machineRate", 20));
  if (flat === null || freeOver === null || labor === null || machine === null) back("/settings", { error: "Enter every amount in dollars, like 12 or 12.50." });
  const mode = text(form, "emailMode", 10);
  const emailMode: EmailMode = mode === "test" || mode === "live" ? mode : "off";
  const footerAddress = text(form, "footerAddress", 240);
  if (emailMode === "live" && !footerAddress) back("/settings", { error: "Add the studio's mailing address before turning email to Live; every newsletter must include it." });

  await saveSettings(db, {
    checkoutEnabled: checked(form, "checkoutEnabled"),
    shippingFlatRateCents: flat,
    shippingFreeOverCents: freeOver,
    laborRateCents: labor,
    machineRateCents: machine,
    emailMode,
    footerAddress,
  });
  await recordAudit(db, {
    actorEmail: viewer.email, action: "settings.saved", entityType: "settings", summary: "Updated store settings",
    metadata: { checkoutEnabled: checked(form, "checkoutEnabled"), emailModeBefore: before.emailMode, emailModeAfter: emailMode, flatRate: flat, freeOver },
  });
  back("/settings", { notice: "Settings saved." });
}
