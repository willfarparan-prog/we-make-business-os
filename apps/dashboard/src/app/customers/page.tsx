import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { addContactAction } from "@/app/actions/customers";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { contacts } from "@/db/schema";
import { consentedSql } from "@/lib/contacts";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  return (
    <OwnerPage active="customers">
      {async ({ db }) => {
        const rows = await db
          .select({
            id: contacts.id, email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName, type: contacts.type, source: contacts.source, createdAt: contacts.createdAt,
            subscribed: sql<boolean>`${consentedSql}`,
            spentCents: sql<number>`(select coalesce(sum(amount_cents), 0)::int from payments where contact_id = ${contacts.id})`,
            orderCount: sql<number>`(select count(*)::int from orders where contact_id = ${contacts.id} and paid_at is not null)`,
          })
          .from(contacts)
          .where(query ? or(ilike(contacts.email, `%${query}%`), ilike(contacts.firstName, `%${query}%`), ilike(contacts.lastName, `%${query}%`)) : undefined)
          .orderBy(desc(contacts.createdAt))
          .limit(300);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="People" title="Customers" intro="Everyone who bought or joined Notes from the Studio. Buying doesn't subscribe anyone; only the signup form (or their say-so) does." />
            <form className="wm-row" style={{ marginBottom: 16 }}>
              <input className="wm-input" name="q" defaultValue={query} placeholder="Search name or email" style={{ maxWidth: 320 }} />
              <button className="wm-button" data-variant="ghost" type="submit">Search</button>
            </form>
            <section className="wm-card wm-card-flush" style={{ marginBottom: 20 }}>
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th>Person</th><th>Type</th><th>Newsletter</th><th className="num">Orders</th><th className="num">Spent</th><th>Since</th></tr></thead>
                  <tbody>
                    {rows.map((person) => (
                      <tr key={person.id}>
                        <td><Link href={`/customers/${person.id}`}>{[person.firstName, person.lastName].filter(Boolean).join(" ") || person.email}</Link><div className="wm-muted wm-small">{person.email}</div></td>
                        <td className="wm-small">{person.type}</td>
                        <td>{person.subscribed ? <span className="wm-badge" data-tone="good">Subscribed</span> : <span className="wm-muted wm-small">—</span>}</td>
                        <td className="num">{person.orderCount}</td>
                        <td className="num">{person.spentCents ? formatCents(person.spentCents) : "—"}</td>
                        <td className="wm-small">{person.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">{query ? "Nobody matches that search." : "No customers yet. Signups and orders from the site appear here."}</p> : null}
              </div>
            </section>
            <form action={addContactAction} className="wm-card wm-form" style={{ maxWidth: 760 }}>
              <header><h2 className="wm-display">Add someone</h2></header>
              <div className="wm-fields">
                <label className="wm-field">Email<input name="email" type="email" required /></label>
                <label className="wm-field">First name<input name="firstName" /></label>
                <label className="wm-field">Last name<input name="lastName" /></label>
              </div>
              <label className="wm-check"><input type="checkbox" name="consent" /><span>They asked to receive the newsletter (at a market, by email…). Only tick this with their permission.</span></label>
              <div><button className="wm-button" type="submit">Save</button></div>
            </form>
          </>
        );
      }}
    </OwnerPage>
  );
}
