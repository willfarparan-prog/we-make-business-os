"use server";

import { eq, sql } from "drizzle-orm";
import { requireDatabase } from "@/db";
import { consentRecords, contacts } from "@/db/schema";
import { requireOwner } from "@/lib/auth/owner";
import { latestConsent, normalizeEmail, recordActivity, upsertContact } from "@/lib/contacts";
import { back, checked, id, text } from "@/lib/forms";
import { recordAudit } from "@/lib/operations/audit";

export async function addContactAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const email = normalizeEmail(text(form, "email", 254));
  if (!email) back("/customers", { error: "Enter a valid email address." });
  const consent = checked(form, "consent");
  const contact = await upsertContact(db, { email, firstName: text(form, "firstName", 80), lastName: text(form, "lastName", 80), source: "Added in dashboard", tags: consent ? ["newsletter"] : [] });
  if (consent && !(await latestConsent(db, contact.id))?.granted) {
    await db.insert(consentRecords).values({ contactId: contact.id, granted: true, source: `Added by ${viewer.email} (consent confirmed)` });
    await recordActivity(db, contact.id, "subscribed", "Added to the newsletter from the dashboard");
  }
  await recordAudit(db, { actorEmail: viewer.email, action: "contact.added", entityType: "contact", entityId: contact.id, summary: `Added ${email}`, metadata: { consent } });
  back(`/customers/${contact.id}`, { notice: "Contact saved." });
}

export async function saveContactAction(form: FormData) {
  await requireOwner();
  const db = requireDatabase();
  const contactId = id(form);
  if (!contactId) back("/customers", { error: "That contact couldn't be found." });
  await db
    .update(contacts)
    .set({ firstName: text(form, "firstName", 80) || null, lastName: text(form, "lastName", 80) || null, notes: text(form, "notes", 2000) || null, updatedAt: sql`now()` })
    .where(eq(contacts.id, contactId));
  back(`/customers/${contactId}`, { notice: "Saved." });
}

/** Records a request to stop emailing someone (by phone, in person, a reply). Re-joining happens only through the site. */
export async function unsubscribeContactAction(form: FormData) {
  const viewer = await requireOwner();
  const db = requireDatabase();
  const contactId = id(form);
  if (!contactId) back("/customers", { error: "That contact couldn't be found." });
  await db.insert(consentRecords).values({ contactId, granted: false, source: `Unsubscribed by ${viewer.email}` });
  await recordActivity(db, contactId, "unsubscribed", "Unsubscribed from the dashboard");
  await recordAudit(db, { actorEmail: viewer.email, action: "contact.unsubscribed", entityType: "contact", entityId: contactId, summary: "Unsubscribed from email" });
  back(`/customers/${contactId}`, { notice: "Unsubscribed. They won't receive the newsletter." });
}
