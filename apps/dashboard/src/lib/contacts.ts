import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { activities, consentRecords, contacts } from "@/db/schema";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed, or null when it isn't an email address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

type ContactInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  source?: string | null;
  type?: "subscriber" | "customer";
  tags?: string[];
  stripeCustomerId?: string | null;
};

/**
 * Creates or updates a contact by email. Known names are kept, tags are merged,
 * and a subscriber who buys becomes a customer — never the other way round.
 */
export async function upsertContact(db: Database, input: ContactInput) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("A valid email is required.");
  const tags = [...new Set(input.tags ?? [])];
  const [row] = await db
    .insert(contacts)
    .values({
      email,
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName?.trim() || null,
      source: input.source ?? null,
      type: input.type ?? "subscriber",
      tags,
      stripeCustomerId: input.stripeCustomerId ?? null,
    })
    .onConflictDoUpdate({
      target: contacts.email,
      set: {
        firstName: sql`coalesce(${contacts.firstName}, excluded.first_name)`,
        lastName: sql`coalesce(${contacts.lastName}, excluded.last_name)`,
        source: sql`coalesce(${contacts.source}, excluded.source)`,
        type: sql`case when excluded.type = 'customer' then 'customer' else ${contacts.type} end`,
        tags: sql`array(select distinct unnest(${contacts.tags} || excluded.tags))`,
        stripeCustomerId: sql`coalesce(excluded.stripe_customer_id, ${contacts.stripeCustomerId})`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

/** The latest email-consent answer for a contact, or null if they never gave one. */
export async function latestConsent(db: Database, contactId: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.contactId, contactId), eq(consentRecords.channel, "email")))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return row ?? null;
}

export async function recordActivity(db: Database, contactId: string, kind: string, summary: string, metadata: Record<string, string | number | boolean | null> = {}) {
  await db.insert(activities).values({ contactId, kind, summary, metadata });
}

/** The storefront's "Notes from the studio" signup. Repeating it is harmless. */
export async function subscribe(db: Database, input: { email: string; firstName?: string | null; source: string; ip?: string | null }) {
  const contact = await upsertContact(db, { email: input.email, firstName: input.firstName, source: input.source, tags: ["newsletter"] });
  const current = await latestConsent(db, contact.id);
  if (current?.granted) return { contact, alreadySubscribed: true };
  await db.insert(consentRecords).values({ contactId: contact.id, channel: "email", granted: true, source: input.source, ip: input.ip ?? null });
  await recordActivity(db, contact.id, "subscribed", `Joined the newsletter (${input.source})`);
  return { contact, alreadySubscribed: false };
}

/** One-click unsubscribe from an email link. Returns the contact, or null for an unknown token. */
export async function unsubscribeByToken(db: Database, token: string) {
  if (!token || token.length > 100) return null;
  const [contact] = await db.select().from(contacts).where(eq(contacts.unsubscribeToken, token)).limit(1);
  if (!contact) return null;
  const current = await latestConsent(db, contact.id);
  if (current && !current.granted) return contact;
  await db.insert(consentRecords).values({ contactId: contact.id, channel: "email", granted: false, source: "Unsubscribe link" });
  await recordActivity(db, contact.id, "unsubscribed", "Unsubscribed from email");
  return contact;
}

/** SQL: contacts whose latest email consent is a yes. */
export const consentedSql = sql`(
  select cr.granted from ${consentRecords} cr
  where cr.contact_id = ${contacts.id} and cr.channel = 'email'
  order by cr.created_at desc limit 1
) is true`;
