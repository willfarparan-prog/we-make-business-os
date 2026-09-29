import Link from "next/link";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { num } from "@/lib/costing";
import { formatCents } from "@/lib/money";
import { releaseStaleReservations } from "@/lib/orders/checkout";
import {
  batchesInProgress,
  fulfilmentQueue,
  lowStock,
  madeToOrderDemand,
  materialsToReorder,
  printersDue,
  salesSummary,
  subscriberSummary,
  weeklyRevenue,
} from "@/lib/overview";

export const dynamic = "force-dynamic";

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

export default function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="overview">
      {async ({ db }) => {
        await releaseStaleReservations(db);
        const [sales, weeks, queue, demand, low, reorder, batches, due, audience] = await Promise.all([
          salesSummary(db),
          weeklyRevenue(db),
          fulfilmentQueue(db),
          madeToOrderDemand(db),
          lowStock(db),
          materialsToReorder(db),
          batchesInProgress(db),
          printersDue(db),
          subscriberSummary(db),
        ]);
        const peak = Math.max(1, ...weeks.map((week) => week.cents));
        const alerts = low.length + reorder.length + due.length;

        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="The studio today" title="Overview" intro="What sold, what needs packing, what the workshop owes, and what's running low." />

            <div className="wm-stats">
              <div className="wm-card wm-stat"><p className="wm-eyebrow">Revenue · 30 days</p><strong>{formatCents(sales.revenueCents)}</strong><span>{sales.orders} order{sales.orders === 1 ? "" : "s"}{sales.refundsCents ? ` · ${formatCents(sales.refundsCents)} refunded` : ""}</span></div>
              <div className="wm-card wm-stat"><p className="wm-eyebrow">Average order</p><strong>{formatCents(sales.averageOrderCents)}</strong><span>Goods margin {pct(sales.goodsMargin)}</span></div>
              <div className="wm-card wm-stat"><p className="wm-eyebrow">To pack</p><strong>{queue.paid}</strong><span>{queue.packed} packed, waiting to ship</span></div>
              <div className="wm-card wm-stat"><p className="wm-eyebrow">Subscribers</p><strong>{audience.subscribers}</strong><span>+{audience.recent} in 30 days · {audience.customers} customers</span></div>
            </div>

            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Revenue by week</h2><span className="wm-muted wm-small">last 12 weeks</span></header>
                  <div className="wm-bars" role="img" aria-label="Weekly revenue for the last 12 weeks">
                    {weeks.map((week) => (
                      <div key={week.week} title={`${week.week}: ${formatCents(week.cents)}`}>
                        <i style={{ height: `${Math.max(2, (week.cents / peak) * 100)}%`, opacity: week.cents ? 1 : 0.25 }} />
                        <small>{week.week.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">Owed to open orders</h2><Link href="/production" className="wm-small">Production →</Link></header>
                  {demand.length ? (
                    <ul className="wm-list">
                      {demand.map((row) => <li key={row.product_id}><span>{row.name}</span><span className="wm-mono">{row.pieces} to make · {row.orders} order{row.orders === 1 ? "" : "s"}</span></li>)}
                    </ul>
                  ) : <p className="wm-muted">Every paid order is covered by pieces on the shelf.</p>}
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">In the workshop</h2><Link href="/production" className="wm-small">All batches →</Link></header>
                  {batches.length ? (
                    <ul className="wm-list">
                      {batches.map((batch) => <li key={batch.id}><Link href={`/production/${batch.id}`}>{batch.code} · {batch.name}</Link><span className="wm-row"><span className="wm-mono">{batch.planned_qty} pcs</span><StatusBadge status={batch.status} /></span></li>)}
                    </ul>
                  ) : <p className="wm-muted">No batches in progress.</p>}
                </section>
              </div>

              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Needs attention</h2>{alerts ? <span className="wm-badge" data-tone="warn">{alerts}</span> : null}</header>
                  {alerts === 0 ? <p className="wm-muted">Nothing is low, nothing is overdue.</p> : null}
                  {low.length ? (
                    <>
                      <p className="wm-eyebrow" style={{ marginTop: 4 }}>Low finished stock</p>
                      <ul className="wm-list">
                        {low.map((row) => <li key={row.id}><Link href={`/products/${row.id}`}>{row.name}</Link><span className="wm-mono">{row.on_hand - row.reserved} free</span></li>)}
                      </ul>
                    </>
                  ) : null}
                  {reorder.length ? (
                    <>
                      <p className="wm-eyebrow" style={{ marginTop: 14 }}>Materials to reorder</p>
                      <ul className="wm-list">
                        {reorder.map((row) => <li key={row.id}><Link href={`/materials/${row.id}`}>{row.name}</Link><span className="wm-mono">{num(row.on_hand).toLocaleString()} {row.unit} left</span></li>)}
                      </ul>
                    </>
                  ) : null}
                  {due.length ? (
                    <>
                      <p className="wm-eyebrow" style={{ marginTop: 14 }}>Printer service due</p>
                      <ul className="wm-list">
                        {due.map((row) => <li key={row.id}><Link href={`/printers/${row.id}`}>{row.name}</Link><span className="wm-mono">{num(row.total_print_hours).toLocaleString()} h (due at {num(row.next_due_hours).toLocaleString()})</span></li>)}
                      </ul>
                    </>
                  ) : null}
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">Orders</h2><Link href="/orders" className="wm-small">All orders →</Link></header>
                  <dl className="wm-kv">
                    <dt>Paid, to pack</dt><dd className="wm-mono">{queue.paid}</dd>
                    <dt>Packed, to ship</dt><dd className="wm-mono">{queue.packed}</dd>
                    <dt>Shipped (14 days)</dt><dd className="wm-mono">{queue.shipped}</dd>
                    <dt>At checkout now</dt><dd className="wm-mono">{queue.pending}</dd>
                  </dl>
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
