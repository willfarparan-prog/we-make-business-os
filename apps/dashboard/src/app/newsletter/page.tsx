import Link from "next/link";
import { desc } from "drizzle-orm";
import { createCampaignAction } from "@/app/actions/newsletter";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { newsletterCampaigns } from "@/db/schema";
import { audienceFor } from "@/lib/email/newsletter";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

const MODE_TEXT = { off: "Email is off: nothing sends.", test: "Email is in test mode: previews go to you only.", live: "Email is live: approved issues can go to subscribers." };

export default function NewsletterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="newsletter">
      {async ({ db }) => {
        const [rows, settings, audience] = await Promise.all([db.select().from(newsletterCampaigns).orderBy(desc(newsletterCampaigns.createdAt)), getSettings(db), audienceFor(db, "newsletter")]);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Notes from the studio" title="Newsletter" intro={`${audience.length} subscriber${audience.length === 1 ? "" : "s"}. ${MODE_TEXT[settings.emailMode]}`}>
              <form action={createCampaignAction}><button className="wm-button" type="submit">New issue</button></form>
            </PageHead>
            {settings.emailMode !== "live" ? <div className="wm-notice" data-tone="warn">Sending waits for a real sending domain in Resend. Until then, write and approve issues here; change the mode in <Link href="/settings">Settings</Link> when it&apos;s set up.</div> : null}
            <section className="wm-card wm-card-flush">
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th>Subject</th><th>Status</th><th className="num">Sent to</th><th>Updated</th></tr></thead>
                  <tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/newsletter/${row.id}`}>{row.subject}</Link><div className="wm-muted wm-small">{row.preheader}</div></td><td><StatusBadge status={row.status} /></td><td className="num">{row.sentCount || "—"}</td><td className="wm-small">{row.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td></tr>)}</tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">No issues yet.</p> : null}
              </div>
            </section>
          </>
        );
      }}
    </OwnerPage>
  );
}
