import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { approveCampaignAction, saveCampaignAction, sendBroadcastAction, sendTestAction } from "@/app/actions/newsletter";
import { Assistant } from "@/components/assistant/assistant";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { newsletterCampaigns } from "@/db/schema";
import { anthropicSetup } from "@/lib/anthropic";
import { audienceFor, unsubscribeUrl } from "@/lib/email/newsletter";
import { renderNewsletter } from "@/lib/email/render";
import { isUuid } from "@/lib/forms";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="newsletter">
      {async ({ db }) => {
        const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, id)).limit(1);
        if (!campaign) notFound();
        const [settings, audience] = await Promise.all([getSettings(db), audienceFor(db, campaign.audienceTag)]);
        const preview = renderNewsletter({ ...campaign, firstName: "Ada", unsubscribeUrl: unsubscribeUrl("preview"), footerAddress: settings.footerAddress || "(studio mailing address goes here)" });
        const sent = campaign.status === "sent";
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Newsletter issue" title={campaign.subject}>
              <StatusBadge status={campaign.status} />
              <Link className="wm-button" data-variant="ghost" href="/newsletter">All issues</Link>
            </PageHead>
            <div className="wm-grid-2">
              <div className="wm-stack">
                <form action={saveCampaignAction} className="wm-card wm-form">
                  <header><h2 className="wm-display">Write</h2>{campaign.status === "approved" ? <span className="wm-muted wm-small">saving sends it back to draft</span> : null}</header>
                  <input type="hidden" name="id" value={campaign.id} />
                  <label className="wm-field">Subject<input name="subject" required defaultValue={campaign.subject} disabled={sent} /></label>
                  <label className="wm-field">Preview text<input name="preheader" defaultValue={campaign.preheader} disabled={sent} /></label>
                  <label className="wm-field">Body (Markdown; {"{{firstName}}"} works)<textarea name="bodyMd" defaultValue={campaign.bodyMd} style={{ minHeight: 280 }} disabled={sent} /></label>
                  {sent ? null : <div><button className="wm-button" data-variant="ghost" type="submit">Save draft</button></div>}
                </form>
                {sent ? null : <Assistant context={{ kind: "newsletter", id: campaign.id }} current={{ subject: campaign.subject, preheader: campaign.preheader, bodyMd: campaign.bodyMd }} configured={anthropicSetup().configured} />}
              </div>
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Send</h2></header>
                  <dl className="wm-kv">
                    <dt>Audience</dt><dd>{audience.length} subscriber{audience.length === 1 ? "" : "s"}</dd>
                    <dt>Email mode</dt><dd>{settings.emailMode}</dd>
                    {campaign.sentAt ? <><dt>Sent</dt><dd>{campaign.sentAt.toLocaleString("en-US")} · {campaign.sentCount}</dd></> : null}
                  </dl>
                  {sent ? null : (
                    <div className="wm-stack" style={{ marginTop: 16, gap: 12 }}>
                      {campaign.status === "draft" ? <form action={approveCampaignAction}><input type="hidden" name="id" value={campaign.id} /><button className="wm-button" type="submit">Approve this issue</button></form> : null}
                      <form action={sendTestAction}><input type="hidden" name="id" value={campaign.id} /><button className="wm-button" data-variant="ghost" type="submit" disabled={settings.emailMode === "off"}>Send me a test</button></form>
                      {campaign.status === "approved" ? (
                        <form action={sendBroadcastAction} className="wm-row">
                          <input type="hidden" name="id" value={campaign.id} />
                          <input className="wm-input" name="confirm" placeholder="Type SEND" style={{ width: 120 }} disabled={settings.emailMode !== "live"} />
                          <button className="wm-button" type="submit" disabled={settings.emailMode !== "live"}>Send to {audience.length}</button>
                        </form>
                      ) : null}
                    </div>
                  )}
                </section>
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Preview</h2></header>
                  <iframe title="Email preview" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 560, border: 0, background: "#f5f2ea", display: "block", marginTop: 12 }} />
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
