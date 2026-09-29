import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { createBatchAction } from "@/app/actions/production";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { printers, productionBatches, products } from "@/db/schema";
import { madeToOrderDemand } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production" };

export default function ProductionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="production">
      {async ({ db }) => {
        const [batches, productList, printerList, demand] = await Promise.all([
          db.select({ batch: productionBatches, name: products.name }).from(productionBatches).innerJoin(products, eq(products.id, productionBatches.productId)).orderBy(desc(productionBatches.createdAt)).limit(100),
          db.select({ id: products.id, name: products.name }).from(products).where(ne(products.status, "archived")).orderBy(asc(products.sortOrder), asc(products.name)),
          db.select({ id: printers.id, name: printers.name }).from(printers).orderBy(asc(printers.name)),
          madeToOrderDemand(db),
        ]);
        const open = batches.filter(({ batch }) => !["completed", "cancelled"].includes(batch.status));
        const done = batches.filter(({ batch }) => ["completed", "cancelled"].includes(batch.status));
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Workshop" title="Production" intro="Plan small batches, tick off each stage from print to pack, and finished pieces land in stock when you complete the batch." />
            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">In progress</h2></header>
                  <BatchTable rows={open} empty="Nothing in the workshop. Plan a batch." />
                </section>
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Finished</h2></header>
                  <BatchTable rows={done} empty="Completed batches show here." />
                </section>
              </div>
              <div className="wm-stack">
                <form action={createBatchAction} className="wm-card wm-form">
                  <header><h2 className="wm-display">Plan a batch</h2></header>
                  {productList.length ? (
                    <>
                      <label className="wm-field">Product<select name="productId">{productList.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                      <div className="wm-fields">
                        <label className="wm-field">Pieces<input name="plannedQty" inputMode="numeric" defaultValue={4} /></label>
                        <label className="wm-field">Printer<select name="printerId" defaultValue=""><option value="">—</option>{printerList.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label>
                      </div>
                      <label className="wm-field">Notes<textarea name="notes" placeholder="Resin colour, file version, anything to remember." style={{ minHeight: 70 }} /></label>
                      <div><button className="wm-button" type="submit">Plan batch</button></div>
                    </>
                  ) : <p className="wm-muted"><Link href="/products/new">Add a product</Link> first.</p>}
                </form>
                <section className="wm-card">
                  <header><h2 className="wm-display">Owed to orders</h2></header>
                  {demand.length ? (
                    <ul className="wm-list">{demand.map((row) => <li key={row.product_id}><span>{row.name}</span><span className="wm-mono">{row.pieces} for {row.orders} order{row.orders === 1 ? "" : "s"}</span></li>)}</ul>
                  ) : <p className="wm-muted" style={{ margin: 0 }}>No made-to-order pieces waiting.</p>}
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}

type Row = { batch: typeof productionBatches.$inferSelect; name: string };

function BatchTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="wm-empty">{empty}</p>;
  return (
    <div className="wm-table-wrap">
      <table className="wm-table">
        <thead><tr><th>Batch</th><th>Product</th><th>Stage</th><th className="num">Planned</th><th className="num">Good</th><th>Edition</th></tr></thead>
        <tbody>
          {rows.map(({ batch, name }) => (
            <tr key={batch.id}>
              <td><Link href={`/production/${batch.id}`}>{batch.code}</Link></td>
              <td>{name}</td>
              <td><StatusBadge status={batch.status} /></td>
              <td className="num">{batch.plannedQty}</td>
              <td className="num">{batch.status === "completed" ? batch.goodQty : "—"}</td>
              <td className="wm-small">{batch.editionStart ? `${batch.editionStart}–${batch.editionEnd}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
