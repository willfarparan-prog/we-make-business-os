import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/db";
import { num } from "@/lib/costing";

/*
 * The numbers the owner opens the dashboard for. Raw SQL: each is one
 * aggregate, and reads more plainly here than as a query builder chain.
 */

const rows = async <T,>(db: Database, query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

/** Paid orders count once they're paid, whatever happened in fulfilment since; refunds come off revenue. */
const PAID = sql`('paid', 'packed', 'shipped', 'delivered', 'refunded')`;

export async function salesSummary(db: Database, days = 30) {
  const [money] = await rows<{ revenue: string | null; refunds: string | null }>(db, sql`
    select
      coalesce(sum(amount_cents) filter (where kind = 'payment'), 0) as revenue,
      coalesce(sum(amount_cents) filter (where kind = 'refund'), 0) as refunds
    from payments where occurred_at >= now() - make_interval(days => ${days})`);
  const [ordersRow] = await rows<{ count: number; goods: string | null; cost: string | null }>(db, sql`
    select count(distinct o.id)::int as count,
      coalesce(sum(oi.unit_price_cents * oi.quantity), 0) as goods,
      coalesce(sum(oi.unit_cost_cents * oi.quantity), 0) as cost
    from orders o join order_items oi on oi.order_id = o.id
    where o.status in ${PAID} and o.paid_at >= now() - make_interval(days => ${days})`);
  const revenue = num(money?.revenue);
  const refunds = num(money?.refunds);
  const goods = num(ordersRow?.goods);
  const cost = num(ordersRow?.cost);
  return {
    days,
    revenueCents: revenue + refunds,
    refundsCents: -refunds,
    orders: ordersRow?.count ?? 0,
    averageOrderCents: ordersRow?.count ? Math.round(revenue / ordersRow.count) : 0,
    goodsMargin: goods > 0 ? (goods - cost) / goods : null,
  };
}

/** Revenue per week for the last N weeks, oldest first, for the overview's trend. */
export async function weeklyRevenue(db: Database, weeks = 12) {
  const data = await rows<{ week: string; cents: string }>(db, sql`
    select to_char(w.week, 'YYYY-MM-DD') as week, coalesce(sum(p.amount_cents), 0) as cents
    from generate_series(date_trunc('week', now()) - make_interval(weeks => ${weeks - 1}), date_trunc('week', now()), interval '1 week') as w(week)
    left join payments p on date_trunc('week', p.occurred_at) = w.week
    group by w.week order by w.week`);
  return data.map((row) => ({ week: row.week, cents: num(row.cents) }));
}

export async function fulfilmentQueue(db: Database) {
  const [counts] = await rows<{ paid: number; packed: number; shipped: number; pending: number }>(db, sql`
    select count(*) filter (where status = 'paid')::int as paid,
      count(*) filter (where status = 'packed')::int as packed,
      count(*) filter (where status = 'shipped' and shipped_at >= now() - interval '14 days')::int as shipped,
      count(*) filter (where status = 'pending')::int as pending
    from orders`);
  return counts ?? { paid: 0, packed: 0, shipped: 0, pending: 0 };
}

/** Pieces sold but not on the shelf when ordered: what production owes open orders, per product. */
export async function madeToOrderDemand(db: Database) {
  return rows<{ product_id: string; name: string; pieces: number; orders: number }>(db, sql`
    select p.id as product_id, p.name, sum(oi.quantity - oi.reserved_qty)::int as pieces, count(distinct o.id)::int as orders
    from orders o join order_items oi on oi.order_id = o.id join products p on p.id = oi.product_id
    where o.status in ('paid', 'packed') and oi.quantity > oi.reserved_qty
    group by p.id, p.name order by pieces desc`);
}

/** Stock-only products running low. Made-to-order pieces are sold without shelf stock, so they never alert. */
export async function lowStock(db: Database) {
  return rows<{ id: string; name: string; on_hand: number; reserved: number; low_threshold: number; made_to_order: boolean }>(db, sql`
    select p.id, p.name, coalesce(s.on_hand, 0) as on_hand, coalesce(s.reserved, 0) as reserved, coalesce(s.low_threshold, 2) as low_threshold, p.made_to_order
    from products p left join product_stock s on s.product_id = p.id
    where p.status = 'active' and not p.made_to_order and coalesce(s.on_hand, 0) - coalesce(s.reserved, 0) <= coalesce(s.low_threshold, 2)
    order by coalesce(s.on_hand, 0) - coalesce(s.reserved, 0)`);
}

export async function materialsToReorder(db: Database) {
  return rows<{ id: string; name: string; unit: string; on_hand: string; reorder_point: string; reorder_qty: string; supplier: string | null }>(db, sql`
    select id, name, unit, on_hand, reorder_point, reorder_qty, supplier from materials
    where reorder_point > 0 and on_hand <= reorder_point order by on_hand / nullif(reorder_point, 0)`);
}

export async function batchesInProgress(db: Database) {
  return rows<{ id: string; code: string; status: string; planned_qty: number; name: string; created_at: string }>(db, sql`
    select b.id, b.code, b.status, b.planned_qty, p.name, b.created_at from production_batches b join products p on p.id = b.product_id
    where b.status not in ('completed', 'cancelled') order by b.created_at`);
}

/** Printers whose latest service says the next one is due at or below their current hours. */
export async function printersDue(db: Database) {
  return rows<{ id: string; name: string; total_print_hours: string; next_due_hours: string }>(db, sql`
    select pr.id, pr.name, pr.total_print_hours, last.next_due_hours
    from printers pr
    join lateral (select next_due_hours from maintenance_logs m where m.printer_id = pr.id order by performed_at desc limit 1) last on true
    where last.next_due_hours is not null and pr.total_print_hours >= last.next_due_hours`);
}

export async function subscriberSummary(db: Database) {
  const [row] = await rows<{ subscribers: number; recent: number; customers: number }>(db, sql`
    with latest as (
      select distinct on (contact_id) contact_id, granted, created_at from consent_records where channel = 'email' order by contact_id, created_at desc
    )
    select
      (select count(*) from latest where granted)::int as subscribers,
      (select count(*) from latest where granted and created_at >= now() - interval '30 days')::int as recent,
      (select count(*) from contacts where type = 'customer')::int as customers`);
  return row ?? { subscribers: 0, recent: 0, customers: 0 };
}
