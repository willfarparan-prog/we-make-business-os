import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { contacts, emailSends, newsletterCampaigns } from "@/db/schema";
import { consentedSql } from "@/lib/contacts";
import { renderNewsletter } from "@/lib/email/render";
import { emailSetup, sendEmail } from "@/lib/email/send";
import { getSettings } from "@/lib/settings";
import { dashboardUrl } from "@/lib/urls";

/*
 * Newsletter sending, behind three locks:
 *   1. the email mode — off sends nothing, test sends only to the owner, live can broadcast;
 *   2. approval — a campaign must be approved, and editing it takes the approval away;
 *   3. consent — only contacts whose latest answer is yes, and each at most once per campaign.
 */

export function unsubscribeUrl(token: string) {
  return `${dashboardUrl()}/unsubscribe/${token}`;
}

/** Subscribers a campaign would reach right now. */
export async function audienceFor(db: Database, tag: string) {
  return db
    .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName, unsubscribeToken: contacts.unsubscribeToken })
    .from(contacts)
    .where(and(sql`${tag} = any(${contacts.tags})`, consentedSql));
}

type Outcome = { ok: true; message: string } | { ok: false; message: string };

export async function sendTestEmail(db: Database, campaignId: string, ownerEmail: string): Promise<Outcome> {
  const settings = await getSettings(db);
  if (settings.emailMode === "off") return { ok: false, message: "Email is off. Switch it to Test in Settings to send yourself a preview." };
  if (!emailSetup().configured) return { ok: false, message: "Resend isn't connected yet, so nothing can send." };
  const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, campaignId)).limit(1);
  if (!campaign) return { ok: false, message: "That campaign no longer exists." };
  const { html, text } = renderNewsletter({ ...campaign, firstName: null, unsubscribeUrl: unsubscribeUrl("preview"), footerAddress: settings.footerAddress });
  const result = await sendEmail({ to: ownerEmail, subject: `[Test] ${campaign.subject}`, html, text });
  await db.insert(emailSends).values({ campaignId, toEmail: ownerEmail, kind: "test", status: result.ok ? "sent" : "failed", providerId: result.ok ? result.id : null, error: result.ok ? null : result.error });
  return result.ok ? { ok: true, message: `Test sent to ${ownerEmail}.` } : { ok: false, message: result.error };
}

export async function sendBroadcast(db: Database, campaignId: string): Promise<Outcome> {
  const settings = await getSettings(db);
  if (settings.emailMode !== "live") return { ok: false, message: "Email isn't live. Broadcasts only go out when Settings → Email is set to Live." };
  if (!settings.footerAddress.trim()) return { ok: false, message: "Add the studio's mailing address in Settings first; the law requires it in every newsletter." };
  if (!emailSetup().configured) return { ok: false, message: "Resend isn't connected yet, so nothing can send." };
  const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, campaignId)).limit(1);
  if (!campaign) return { ok: false, message: "That campaign no longer exists." };
  if (campaign.status !== "approved") return { ok: false, message: "Approve the campaign before sending it." };

  const audience = await audienceFor(db, campaign.audienceTag);
  let sent = 0;
  let failed = 0;
  for (const person of audience) {
    // Claim the send first: the unique index means a second click or a retry can't email anyone twice.
    const [claim] = await db
      .insert(emailSends)
      .values({ campaignId, contactId: person.id, toEmail: person.email, kind: "broadcast", status: "sending" })
      .onConflictDoNothing()
      .returning({ id: emailSends.id });
    if (!claim) continue;
    const link = unsubscribeUrl(person.unsubscribeToken);
    const { html, text } = renderNewsletter({ ...campaign, firstName: person.firstName, unsubscribeUrl: link, footerAddress: settings.footerAddress });
    const result = await sendEmail({
      to: person.email,
      subject: campaign.subject,
      html,
      text,
      headers: { "List-Unsubscribe": `<${dashboardUrl()}/api/unsubscribe/${person.unsubscribeToken}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await db
      .update(emailSends)
      .set({ status: result.ok ? "sent" : "failed", providerId: result.ok ? result.id : null, error: result.ok ? null : result.error })
      .where(eq(emailSends.id, claim.id));
    if (result.ok) sent += 1;
    else failed += 1;
  }
  await db
    .update(newsletterCampaigns)
    .set({ status: "sent", sentAt: sql`coalesce(${newsletterCampaigns.sentAt}, now())`, sentCount: sql`${newsletterCampaigns.sentCount} + ${sent}`, updatedAt: sql`now()` })
    .where(eq(newsletterCampaigns.id, campaignId));
  return failed ? { ok: false, message: `Sent to ${sent}; ${failed} failed. Open Operations for details.` } : { ok: true, message: `Sent to ${sent} subscriber${sent === 1 ? "" : "s"}.` };
}
