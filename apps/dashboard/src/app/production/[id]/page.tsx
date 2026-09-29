import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { cancelBatchAction, completeBatchAction, setBatchStatusAction, toggleStepAction } from "@/app/actions/production";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { BATCH_STATUSES, BATCH_STEPS, batchSteps, printers, productionBatches, products } from "@/db/schema";
import { isUuid } from "@/lib/forms";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<string, string> = { print: "Print", cast: "Cast resin", sand: "Sand", inlay: "Inlay & assemble", qc: "Quality check", pack: "Pack" };

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="production">
      {async ({ db }) => {
        const [row] = await db
          .select({ batch: productionBatches, product: products, printer: printers.name })
          .from(productionBatches)
          .innerJoin(products, eq(products.id, productionBatches.productId))
          .leftJoin(printers, eq(printers.id, productionBatches.printerId))
          .where(eq(productionBatches.id, id))
          .limit(1);
        if (!row) notFound();
        const order: readonly string[] = BATCH_STEPS;
        const steps = (await db.select().from(batchSteps).where(eq(batchSteps.batchId, id))).sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
        const { batch, product } = row;
        const finished = batch.status === "completed" || batch.status === "cancelled";
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`Batch · ${product.name}`} title={batch.code}>
              <StatusBadge status={batch.status} />
              <Link className="wm-button" data-variant="ghost" href="/production">All batches</Link>
            </PageHead>
            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Stages</h2><span className="wm-muted wm-small">{steps.filter((step) => step.done).length} of {steps.length} done</span></header>
                  <ul className="wm-list">
                    {steps.map((step) => (
                      <li key={step.id}>
                        <form action={toggleStepAction} className="wm-row" style={{ width: "100%", justifyContent: "space-between" }}>
                          <input type="hidden" name="id" value={batch.id} /><input type="hidden" name="stepId" value={step.id} />
                          <label className="wm-check" style={{ minWidth: 160 }}><input type="checkbox" name="done" defaultChecked={step.done} disabled={finished} /><strong>{STEP_LABEL[step.step] ?? step.step}</strong></label>
                          <input className="wm-input" name="minutes" defaultValue={step.minutes ?? ""} placeholder="min" inputMode="numeric" style={{ width: 70 }} disabled={finished} />
                          <input className="wm-input" name="notes" defaultValue={step.notes ?? ""} placeholder="Notes" style={{ flex: 1, minWidth: 120 }} disabled={finished} />
                          {finished ? null : <button className="wm-button" data-variant="ghost" data-size="sm" type="submit">Save</button>}
                        </form>
                      </li>
                    ))}
                  </ul>
                </section>
                {batch.notes ? <section className="wm-card"><header><h2 className="wm-display">Notes</h2></header><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{batch.notes}</p></section> : null}
              </div>
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Batch</h2></header>
                  <dl className="wm-kv">
                    <dt>Product</dt><dd><Link href={`/products/${product.id}`}>{product.name}</Link></dd>
                    <dt>Planned</dt><dd className="wm-mono">{batch.plannedQty} pieces</dd>
                    <dt>Printer</dt><dd>{row.printer ?? "—"}</dd>
                    {batch.status === "completed" ? <><dt>Good / rejected</dt><dd className="wm-mono">{batch.goodQty} / {batch.rejectQty}</dd></> : null}
                    {batch.editionStart ? <><dt>Edition numbers</dt><dd className="wm-mono">{batch.editionStart}–{batch.editionEnd}{product.editionSize ? ` of ${product.editionSize}` : ""}</dd></> : null}
                    <dt>Planned on</dt><dd>{batch.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd>
                    {batch.completedAt ? <><dt>Completed</dt><dd>{batch.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd></> : null}
                  </dl>
                </section>
                {finished ? null : (
                  <>
                    <form action={setBatchStatusAction} className="wm-card wm-form">
                      <header><h2 className="wm-display">Stage</h2></header>
                      <input type="hidden" name="id" value={batch.id} />
                      <label className="wm-field"><select name="status" defaultValue={batch.status}>{BATCH_STATUSES.filter((status) => status !== "completed" && status !== "cancelled").map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></label>
                      <div><button className="wm-button" data-variant="ghost" type="submit">Move</button></div>
                    </form>
                    <form action={completeBatchAction} className="wm-card wm-form">
                      <header><h2 className="wm-display">Complete batch</h2></header>
                      <input type="hidden" name="id" value={batch.id} />
                      <div className="wm-fields">
                        <label className="wm-field">Good pieces<input name="goodQty" inputMode="numeric" defaultValue={batch.plannedQty} /></label>
                        <label className="wm-field">Rejected<input name="rejectQty" inputMode="numeric" defaultValue={0} /></label>
                      </div>
                      <p className="wm-muted wm-small" style={{ margin: 0 }}>Adds the good pieces to stock, uses up their materials (rejects included) and logs print hours. Happens once.</p>
                      <div><button className="wm-button" type="submit">Complete and add to stock</button></div>
                    </form>
                    <form action={cancelBatchAction}>
                      <input type="hidden" name="id" value={batch.id} />
                      <button className="wm-button" data-variant="danger" type="submit">Cancel batch</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
