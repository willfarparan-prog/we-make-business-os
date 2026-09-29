import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { orders } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { releaseStaleReservations } from "@/lib/orders/checkout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const TABS = [
  { key: "open", label: "To fulfil", statuses: ["paid", "packed"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped", "delivered"] },
  { key: "checkout", label: "At checkout", statuses: ["pending"] },
  { key: "closed", label: "Closed", statuses: ["expired", "cancelled", "refunded"] },
  { key: "all", label: "All", statuses: [] },
] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = TABS.find((candidate) => candidate.key === params.tab) ?? TABS[0];
  return (
    <OwnerPage active="orders">
      {async ({ db }) => {
        await releaseStaleReservations(db);
        const statuses = [...tab.statuses];
        const rows = await db
          .select({
            id: orders.id, number: orders.number, status: orders.status, name: orders.name, email: orders.email, totalCents: orders.totalCents, createdAt: orders.createdAt, paidAt: orders.paidAt,
            pieces: sql<number>`(select coalesce(sum(quantity), 0)::int from order_items where order_id = ${orders.id})`,
            toMake: sql<number>`(select coalesce(sum(quantity - reserved_qty), 0)::int from order_items where order_id = ${orders.id})`,
          })
          .from(orders)
          .where(statuses.length ? inArray(orders.status, statuses) : undefined)
          .orderBy(desc(orders.createdAt))
          .limit(200);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Sales" title="Orders" intro="Paid orders arrive from Stripe by themselves. Pack them, add tracking, and they move along." />
            <nav className="wm-tabs" aria-label="Order status">
              {TABS.map((candidate) => <Link key={candidate.key} href={`/orders?tab=${candidate.key}`} aria-current={candidate.key === tab.key ? "page" : undefined}>{candidate.label}</Link>)}
            </nav>
            <section className="wm-card wm-card-flush">
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Pieces</th><th className="num">Total</th><th>Placed</th></tr></thead>
                  <tbody>
                    {rows.map((order) => (
                      <tr key={order.id}>
                        <td><Link href={`/orders/${order.id}`}>WM-{order.number}</Link></td>
                        <td>{order.name ?? <span className="wm-muted">—</span>}<div className="wm-muted wm-small">{order.email ?? ""}</div></td>
                        <td><StatusBadge status={order.status} />{order.toMake > 0 && ["paid", "packed"].includes(order.status) ? <> <span className="wm-badge" data-tone="warn">{order.toMake} to make</span></> : null}</td>
                        <td className="num">{order.pieces}</td>
                        <td className="num">{formatCents(order.totalCents, { always: true })}</td>
                        <td className="wm-small">{(order.paidAt ?? order.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">{tab.key === "open" ? "Nothing to pack. New paid orders show up here." : "No orders here."}</p> : null}
              </div>
            </section>
          </>
        );
      }}
    </OwnerPage>
  );
}
