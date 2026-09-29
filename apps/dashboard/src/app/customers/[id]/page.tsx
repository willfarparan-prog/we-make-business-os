import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { saveContactAction, unsubscribeContactAction } from "@/app/actions/customers";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { activities, contacts, orders } from "@/db/schema";
import { latestConsent } from "@/lib/contacts";
import { isUuid } from "@/lib/forms";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="customers">
      {async ({ db }) => {
        const [person] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
        if (!person) notFound();
        const [consent, orderRows, timeline] = await Promise.all([
          latestConsent(db, id),
          db.select().from(orders).where(eq(orders.contactId, id)).orderBy(desc(orders.createdAt)),
          db.select().from(activities).where(eq(activities.contactId, id)).orderBy(desc(activities.occurredAt)).limit(40),
        ]);
        const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`${person.type} · ${person.source ?? "unknown source"}`} title={name || person.email}>
              <Link className="wm-button" data-variant="ghost" href="/customers">All customers</Link>
            </PageHead>
            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Orders</h2></header>
                  {orderRows.length ? (
                    <div className="wm-table-wrap">
                      <table className="wm-table">
                        <thead><tr><th>Order</th><th>Status</th><th className="num">Total</th><th>Date</th></tr></thead>
                        <tbody>{orderRows.map((order) => <tr key={order.id}><td><Link href={`/orders/${order.id}`}>WM-{order.number}</Link></td><td><StatusBadge status={order.status} /></td><td className="num">{formatCents(order.totalCents, { always: true })}</td><td className="wm-small">{order.createdAt.toLocaleDateString("en-US")}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="wm-empty">No orders.</p>}
                </section>
                <section className="wm-card">
                  <header><h2 className="wm-display">Timeline</h2></header>
                  {timeline.length ? <ul className="wm-list">{timeline.map((entry) => <li key={entry.id}><span>{entry.summary}</span><span className="wm-muted wm-small">{entry.occurredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></li>)}</ul> : <p className="wm-muted" style={{ margin: 0 }}>Nothing yet.</p>}
                </section>
              </div>
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Newsletter</h2>{consent?.granted ? <span className="wm-badge" data-tone="good">Subscribed</span> : <span className="wm-badge">Not subscribed</span>}</header>
                  <p className="wm-muted wm-small" style={{ marginTop: 0 }}>{consent ? `${consent.granted ? "Joined" : "Left"} ${consent.createdAt.toLocaleDateString("en-US")} · ${consent.source}` : "Never signed up."}</p>
                  {consent?.granted ? (
                    <form action={unsubscribeContactAction}><input type="hidden" name="id" value={person.id} /><button className="wm-button" data-variant="danger" data-size="sm" type="submit">Unsubscribe them</button></form>
                  ) : null}
                </section>
                <form action={saveContactAction} className="wm-card wm-form">
                  <header><h2 className="wm-display">Details</h2></header>
                  <input type="hidden" name="id" value={person.id} />
                  <p style={{ margin: 0 }}><a href={`mailto:${person.email}`}>{person.email}</a></p>
                  <div className="wm-fields">
                    <label className="wm-field">First name<input name="firstName" defaultValue={person.firstName ?? ""} /></label>
                    <label className="wm-field">Last name<input name="lastName" defaultValue={person.lastName ?? ""} /></label>
                  </div>
                  <label className="wm-field">Notes<textarea name="notes" defaultValue={person.notes ?? ""} /></label>
                  <div><button className="wm-button" data-variant="ghost" type="submit">Save</button></div>
                </form>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
