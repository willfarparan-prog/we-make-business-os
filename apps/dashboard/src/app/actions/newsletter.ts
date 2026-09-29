"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDatabase } from "@/db";
import { newsletterCampaigns } from "@/db/schema";
import type { NewsletterFields } from "@/lib/assistant/shape";
import { requireOwner } from "@/lib/auth/owner";
import { sendBroadcast, sendTestEmail } from "@/lib/email/newsletter";
import { back, id, isUuid, text } from "@/lib/forms";
import { recordAudit } from "@/lib/operations/audit";

export async function createCampaignAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const subject = text(form, "subject", 150) || "Notes from the studio";
  const [campaign] = await db.insert(newsletterCampaigns).values({ subject }).returning();
  await recordAudit(db, { actorEmail: viewer.email, action: "newsletter.created", entityType: "newsletter", entityId: campaign.id, summary: `Drafted “${subject}”` });
  back(`/newsletter/${campaign.id}`, { notice: "Draft started." });
}

async function saveFields(campaignId: string, fields: NewsletterFields, actor: string) {
  const db = requireDatabase();
  // Any edit takes the approval away: what gets sent is always what was approved.
  const updated = await db
    .update(newsletterCampaigns)
    .set({ subject: fields.subject.trim().slice(0, 150), preheader: fields.preheader.trim().slice(0, 200), bodyMd: fields.bodyMd.slice(0, 20_000), status: "draft", approvedAt: null, updatedAt: sql`now()` })
    .where(and(eq(newsletterCampaigns.id, campaignId), sql`${newsletterCampaigns.status} <> 'sent'`))
    .returning({ id: newsletterCampaigns.id });
  if (updated.length) await recordAudit(db, { actorEmail: actor, action: "newsletter.edited", entityType: "newsletter", entityId: campaignId, summary: "Edited; back to draft" });
  return updated.length > 0;
}

export async function saveCampaignAction(form: FormData) {
  const viewer = await requireOwner();
  const campaignId = id(form);
  if (!campaignId) back("/newsletter", { error: "That newsletter couldn't be found." });
  const fields = { subject: text(form, "subject", 150), preheader: text(form, "preheader", 200), bodyMd: text(form, "bodyMd", 20_000) };
  if (!fields.subject) back(`/newsletter/${campaignId}`, { error: "A newsletter needs a subject." });
  if (!(await saveFields(campaignId, fields, viewer.email))) back(`/newsletter/${campaignId}`, { error: "A sent newsletter can't be edited." });
  back(`/newsletter/${campaignId}`, { notice: "Saved as a draft. Approve it when it's ready." });
}

export async function approveCampaignAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const campaignId = id(form);
  if (!campaignId) back("/newsletter", { error: "That newsletter couldn't be found." });
  const approved = await db
    .update(newsletterCampaigns)
    .set({ status: "approved", approvedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(newsletterCampaigns.id, campaignId), eq(newsletterCampaigns.status, "draft"), sql`length(trim(${newsletterCampaigns.bodyMd})) > 0`))
    .returning({ id: newsletterCampaigns.id });
  if (!approved.length) back(`/newsletter/${campaignId}`, { error: "Only a draft with a body can be approved." });
  await recordAudit(db, { actorEmail: viewer.email, action: "newsletter.approved", entityType: "newsletter", entityId: campaignId, summary: "Approved for sending" });
  back(`/newsletter/${campaignId}`, { notice: "Approved." });
}

export async function sendTestAction(form: FormData) {
  const viewer = await requireOwner();
  const campaignId = id(form);
  if (!campaignId) back("/newsletter", { error: "That newsletter couldn't be found." });
  const result = await sendTestEmail(requireDatabase(), campaignId, viewer.email);
  back(`/newsletter/${campaignId}`, result.ok ? { notice: result.message } : { error: result.message });
}

export async function sendBroadcastAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const campaignId = id(form);
  if (!campaignId) back("/newsletter", { error: "That newsletter couldn't be found." });
  if (text(form, "confirm", 10) !== "SEND") back(`/newsletter/${campaignId}`, { error: "Type SEND to confirm the broadcast." });
  const result = await sendBroadcast(db, campaignId);
  await recordAudit(db, { actorEmail: viewer.email, action: "newsletter.broadcast", entityType: "newsletter", entityId: campaignId, summary: result.message });
  revalidatePath("/newsletter");
  back(`/newsletter/${campaignId}`, result.ok ? { notice: result.message } : { error: result.message });
}

/** The assistant's Apply button. */
export async function applyNewsletterDraftAction(campaignId: string, fields: NewsletterFields) {
  const viewer = await requireOwner();
  if (!isUuid(campaignId)) return { ok: false, message: "That newsletter couldn't be found." };
  if (!fields.subject.trim()) return { ok: false, message: "A newsletter needs a subject." };
  const saved = await saveFields(campaignId, fields, viewer.email);
  if (!saved) return { ok: false, message: "A sent newsletter can't be edited." };
  revalidatePath(`/newsletter/${campaignId}`);
  return { ok: true, message: "Applied. It's back in draft for your approval." };
}
