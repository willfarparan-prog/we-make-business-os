import "server-only";
import { sql } from "drizzle-orm";
import { atomic, type Database } from "@/db";

/** True when Postgres rejected a change because stock would go negative or below what's reserved. */
export function isStockViolation(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${(error as { code?: string }).code ?? ""} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
  return /product_stock_(on_hand|reserved)_check|23514/.test(text);
}

/** Makes sure a product has a stock row, so reservations and adjustments always have something to update. */
export async function ensureStockRows(db: Database, productIds: string[]) {
  for (const productId of productIds) {
    await db.execute(sql`insert into product_stock (product_id) values (${productId}::uuid) on conflict (product_id) do nothing`);
  }
}

/**
 * A manual stock count or correction. Stock can't go below zero or below what
 * open checkouts are holding; Postgres enforces both, and the caller gets a
 * plain answer instead of an error.
 */
export async function adjustStock(db: Database, input: { productId: string; delta: number; actor: string; note: string }) {
  if (!Number.isInteger(input.delta) || input.delta === 0) return { ok: false as const, message: "Enter a whole number of pieces to add or remove." };
  await ensureStockRows(db, [input.productId]);
  try {
    await atomic(db, [
      sql`update product_stock set on_hand = on_hand + ${input.delta}, updated_at = now() where product_id = ${input.productId}::uuid`,
      sql`insert into stock_movements (product_id, delta, reason, actor, note) values (${input.productId}::uuid, ${input.delta}, 'adjustment', ${input.actor}, ${input.note || null})`,
    ]);
    return { ok: true as const };
  } catch (error) {
    if (isStockViolation(error)) return { ok: false as const, message: "That would take stock below zero, or below pieces held by open checkouts." };
    throw error;
  }
}

/** Puts pieces back on the shelf after a return. Once per order and product. */
export async function restockReturn(db: Database, input: { orderId: string; productId: string; quantity: number; actor: string }) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return { ok: false as const, message: "Enter how many pieces came back." };
  await ensureStockRows(db, [input.productId]);
  const [restocked] = await atomic(db, [
    sql`with moved as (
          insert into stock_movements (product_id, delta, reason, ref_id, actor)
          values (${input.productId}::uuid, ${input.quantity}, 'refund_restock', ${input.orderId}, ${input.actor})
          on conflict do nothing returning id
        )
        update product_stock set on_hand = on_hand + ${input.quantity}, updated_at = now()
        where product_id = ${input.productId}::uuid and exists (select 1 from moved)
        returning product_id`,
  ]);
  if (restocked.length === 0) return { ok: false as const, message: "Already restocked for this order." };
  return { ok: true as const };
}

/**
 * Finishes a production batch: records good and rejected pieces, assigns
 * edition numbers when the product is an edition, adds the good pieces to
 * stock, draws the materials it used down, and adds its print hours to the
 * printer. The posting is guarded by stock_posted_at, so it happens once
 * however many times this runs.
 */
export async function completeBatch(db: Database, input: { batchId: string; goodQty: number; rejectQty: number; actor: string }) {
  const { batchId, goodQty, rejectQty, actor } = input;
  if (!Number.isInteger(goodQty) || !Number.isInteger(rejectQty) || goodQty < 0 || rejectQty < 0) {
    return { ok: false as const, message: "Good and rejected pieces must be whole numbers." };
  }
  const [updated, posted] = await atomic(db, [
    sql`update production_batches pb set
          status = 'completed',
          good_qty = ${goodQty},
          reject_qty = ${rejectQty},
          completed_at = now(),
          updated_at = now(),
          edition_start = case when p.edition_size is not null and ${goodQty} > 0
            then coalesce((select max(edition_end) from production_batches other where other.product_id = pb.product_id and other.id <> pb.id), 0) + 1 end,
          edition_end = case when p.edition_size is not null and ${goodQty} > 0
            then coalesce((select max(edition_end) from production_batches other where other.product_id = pb.product_id and other.id <> pb.id), 0) + ${goodQty} end
        from products p
        where p.id = pb.product_id and pb.id = ${batchId}::uuid and pb.stock_posted_at is null and pb.status <> 'cancelled'
        returning pb.id`,
    sql`with b as (
          update production_batches set stock_posted_at = now()
          where id = ${batchId}::uuid and stock_posted_at is null and status = 'completed'
          returning id, product_id, printer_id, good_qty, reject_qty, code
        ),
        moved as (
          insert into stock_movements (product_id, delta, reason, ref_id, actor, note)
          select product_id, good_qty, 'batch_completed', ${batchId}, ${actor}, code from b where good_qty > 0
          on conflict do nothing returning id
        ),
        used as (
          insert into material_movements (material_id, delta, reason, ref_id, actor, note)
          select pm.material_id, -(pm.qty_per_piece * pm.waste_factor * (b.good_qty + b.reject_qty)), 'batch_consumed', ${batchId}, ${actor}, b.code
          from product_materials pm join b on pm.product_id = b.product_id
          where b.good_qty + b.reject_qty > 0
          on conflict do nothing returning material_id, delta
        ),
        drawn as (
          update materials m set on_hand = m.on_hand + used.delta, updated_at = now() from used where m.id = used.material_id returning m.id
        ),
        hours as (
          update printers pr set total_print_hours = pr.total_print_hours + (p.print_hours * (b.good_qty + b.reject_qty)), updated_at = now()
          from b join products p on p.id = b.product_id where pr.id = b.printer_id returning pr.id
        )
        insert into product_stock (product_id, on_hand)
        select product_id, good_qty from b
        on conflict (product_id) do update set on_hand = product_stock.on_hand + excluded.on_hand, updated_at = now()
        returning product_id`,
  ]);
  if (updated.length === 0 && posted.length === 0) return { ok: false as const, message: "This batch was already completed or is cancelled." };
  return { ok: true as const };
}
