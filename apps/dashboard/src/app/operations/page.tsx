import { desc } from "drizzle-orm";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { emailSends, webhookEvents } from "@/db/schema";
import { recentAudit } from "@/lib/operations/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations" };

export default function OperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="operations">
      {async ({ db }) => {
        const [audit, hooks, sends] = await Promise.all([
          recentAudit(db, 150),
          db.select({ id: webhookEvents.id, eventType: webhookEvents.eventType, processed: webhookEvents.processed, error: webhookEvents.error, receivedAt: webhookEvents.receivedAt }).from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(40),
          db.select().from(emailSends).orderBy(desc(emailSends.createdAt)).limit(40),
        ]);
        const when = (date: Date) => date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Behind the scenes" title="Operations" intro="Every change made in the dashboard, every message from Stripe, and every email handed to Resend." />
            <div className="wm-grid-2">
              <section className="wm-card wm-card-flush">
                <header><h2 className="wm-display">Change log</h2></header>
                <div className="wm-table-wrap">
                  <table className="wm-table">
                    <thead><tr><th>When</th><th>What</th><th>Who</th></tr></thead>
                    <tbody>{audit.map((row) => <tr key={row.id}><td className="wm-small" style={{ whiteSpace: "nowrap" }}>{when(row.occurredAt)}</td><td>{row.summary}<div className="wm-muted wm-small">{row.action}</div></td><td className="wm-small">{row.actorEmail}</td></tr>)}</tbody>
                  </table>
                  {audit.length === 0 ? <p className="wm-empty">No changes recorded yet.</p> : null}
                </div>
              </section>
              <div className="wm-stack">
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Stripe events</h2></header>
                  <div className="wm-table-wrap">
                    <table className="wm-table">
                      <tbody>{hooks.map((hook) => <tr key={hook.id}><td className="wm-small">{when(hook.receivedAt)}</td><td>{hook.eventType}{hook.error ? <div className="wm-muted wm-small">{hook.error}</div> : null}</td><td>{hook.processed ? <span className="wm-badge" data-tone="good">Done</span> : <span className="wm-badge" data-tone={hook.error?.startsWith("ignored") || hook.error?.startsWith("not a handled") ? undefined : "bad"}>{hook.error ? "Skipped" : "Pending"}</span>}</td></tr>)}</tbody>
                    </table>
                    {hooks.length === 0 ? <p className="wm-empty">No Stripe events yet.</p> : null}
                  </div>
                </section>
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Emails</h2></header>
                  <div className="wm-table-wrap">
                    <table className="wm-table">
                      <tbody>{sends.map((send) => <tr key={send.id}><td className="wm-small">{when(send.createdAt)}</td><td>{send.toEmail}<div className="wm-muted wm-small">{send.kind}{send.error ? ` · ${send.error}` : ""}</div></td><td><span className="wm-badge" data-tone={send.status === "sent" ? "good" : send.status === "failed" ? "bad" : undefined}>{send.status}</span></td></tr>)}</tbody>
                    </table>
                    {sends.length === 0 ? <p className="wm-empty">No emails sent yet.</p> : null}
                  </div>
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
