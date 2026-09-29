/** Signups, unsubscribes, and the three locks on sending: mode, approval, consent. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { subscribe, unsubscribeByToken, upsertContact } from "@/lib/contacts";
import { audienceFor, sendBroadcast, sendTestEmail } from "@/lib/email/newsletter";
import { setEmailSenderForTests, type OutgoingEmail } from "@/lib/email/send";
import { saveSettings } from "@/lib/settings";
import { freshDatabase } from "./helpers";

let db: Database;
let client: PGlite;
let outbox: OutgoingEmail[];
beforeEach(async () => {
  ({ db, client } = await freshDatabase());
  outbox = [];
  process.env.RESEND_API_KEY = "re_test_placeholder";
  setEmailSenderForTests(async (email) => {
    outbox.push(email);
    return { ok: true, id: `em_${outbox.length}` };
  });
});
afterEach(async () => {
  setEmailSenderForTests(null);
  delete process.env.RESEND_API_KEY;
  await client.close();
});

async function campaign(status = "approved") {
  const [row] = await db.insert(schema.newsletterCampaigns).values({ subject: "New forms", preheader: "Edition 02", bodyMd: "Hello {{firstName}}.", status }).returning();
  return row;
}

test("signing up twice records consent once; a customer who never signed up isn't emailed", async () => {
  await subscribe(db, { email: " Reader@Example.com ", source: "Website: footer" });
  const again = await subscribe(db, { email: "reader@example.com", source: "Website: footer" });
  assert.equal(again.alreadySubscribed, true);
  assert.equal((await db.select().from(schema.consentRecords)).length, 1);
  await upsertContact(db, { email: "buyer@example.com", type: "customer", tags: ["customer", "newsletter"] });
  assert.deepEqual((await audienceFor(db, "newsletter")).map((person) => person.email), ["reader@example.com"]);
});

test("the latest answer wins: unsubscribing removes someone, re-joining adds them back", async () => {
  const { contact } = await subscribe(db, { email: "reader@example.com", source: "Website" });
  assert.equal((await unsubscribeByToken(db, contact.unsubscribeToken))?.email, "reader@example.com");
  assert.equal((await audienceFor(db, "newsletter")).length, 0);
  assert.equal(await unsubscribeByToken(db, "not-a-token"), null);
  await subscribe(db, { email: "reader@example.com", source: "Website" });
  assert.equal((await audienceFor(db, "newsletter")).length, 1);
});

test("off sends nothing; test sends only to the owner; broadcasts need live, an address and approval", async () => {
  await subscribe(db, { email: "reader@example.com", source: "Website" });
  const draft = await campaign("draft");

  assert.equal((await sendTestEmail(db, draft.id, "owner@example.com")).ok, false, "email starts off");
  await saveSettings(db, { emailMode: "test" });
  assert.equal((await sendTestEmail(db, draft.id, "owner@example.com")).ok, true);
  assert.deepEqual(outbox.map((email) => email.to), ["owner@example.com"]);
  assert.equal((await sendBroadcast(db, draft.id)).ok, false, "test mode never broadcasts");

  await saveSettings(db, { emailMode: "live" });
  assert.match((await sendBroadcast(db, draft.id)).message, /mailing address/);
  await saveSettings(db, { footerAddress: "We+Make, 1 Studio Way, Fresno CA" });
  assert.match((await sendBroadcast(db, draft.id)).message, /Approve/);
  assert.equal(outbox.length, 1);
});

test("a broadcast reaches each subscriber once, with a working unsubscribe", async () => {
  await subscribe(db, { email: "a@example.com", firstName: "Ada", source: "Website" });
  await subscribe(db, { email: "b@example.com", source: "Website" });
  await saveSettings(db, { emailMode: "live", footerAddress: "We+Make, 1 Studio Way" });
  const approved = await campaign();

  assert.deepEqual(await sendBroadcast(db, approved.id), { ok: true, message: "Sent to 2 subscribers." });
  assert.deepEqual(await sendBroadcast(db, approved.id), { ok: false, message: "Approve the campaign before sending it." }, "sent campaigns can't go again");
  assert.equal(outbox.length, 2);
  const ada = outbox.find((email) => email.to === "a@example.com")!;
  assert.match(ada.html, /Hello Ada\./);
  assert.match(ada.headers?.["List-Unsubscribe"] ?? "", /\/api\/unsubscribe\//);
  assert.match(ada.text, /We\+Make, 1 Studio Way/);
});
