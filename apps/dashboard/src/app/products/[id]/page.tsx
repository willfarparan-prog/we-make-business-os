import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { adjustStockAction, removeBomLineAction, saveThresholdAction, setBomLineAction, updateProductAction } from "@/app/actions/products";
import { Assistant } from "@/components/assistant/assistant";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { ProductFields } from "@/components/products/product-form";
import { materials, productMaterials, stockMovements } from "@/db/schema";
import { anthropicSetup } from "@/lib/anthropic";
import { marginOf, num } from "@/lib/costing";
import { isUuid } from "@/lib/forms";
import { formatCents } from "@/lib/money";
import { productsWithStock } from "@/lib/products";
import { getSettings } from "@/lib/settings";
import { absoluteImage } from "@/lib/urls";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  adjustment: "Count / correction",
  batch_completed: "Batch finished",
  order_paid: "Sold",
  refund_restock: "Returned",
};

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="products">
      {async ({ db }) => {
        const settings = await getSettings(db);
        const product = (await productsWithStock(db, settings)).find((row) => row.id === id);
        if (!product) notFound();
        const [bom, allMaterials, movements] = await Promise.all([
          db.select({ materialId: productMaterials.materialId, qtyPerPiece: productMaterials.qtyPerPiece, wasteFactor: productMaterials.wasteFactor, name: materials.name, unit: materials.unit, costPerUnitCents: materials.costPerUnitCents })
            .from(productMaterials).innerJoin(materials, eq(materials.id, productMaterials.materialId)).where(eq(productMaterials.productId, id)).orderBy(asc(materials.name)),
          db.select({ id: materials.id, name: materials.name, unit: materials.unit }).from(materials).orderBy(asc(materials.name)),
          db.select().from(stockMovements).where(eq(stockMovements.productId, id)).orderBy(desc(stockMovements.createdAt)).limit(12),
        ]);
        const margin = marginOf(product.priceCents, product.cost.totalCents);

        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`${product.category} · ${product.handle}`} title={product.name}>
              <StatusBadge status={product.status} />
              <Link className="wm-button" data-variant="ghost" href="/products">All products</Link>
            </PageHead>

            <div className="wm-grid-2">
              <div className="wm-stack">
                <form action={updateProductAction} className="wm-card wm-form">
                  <header><h2 className="wm-display">Storefront details</h2></header>
                  <input type="hidden" name="id" value={product.id} />
                  <ProductFields product={product} />
                  <div><button className="wm-button" type="submit">Save</button></div>
                </form>

                <section className="wm-card">
                  <header><h2 className="wm-display">Materials per piece</h2><span className="wm-muted wm-small">sets the cost below</span></header>
                  {bom.length ? (
                    <div className="wm-table-wrap">
                      <table className="wm-table">
                        <thead><tr><th>Material</th><th className="num">Per piece</th><th className="num">Waste ×</th><th className="num">Cost</th><th /></tr></thead>
                        <tbody>
                          {bom.map((line) => (
                            <tr key={line.materialId}>
                              <td><Link href={`/materials/${line.materialId}`}>{line.name}</Link></td>
                              <td className="num">{num(line.qtyPerPiece)} {line.unit}</td>
                              <td className="num">{num(line.wasteFactor)}</td>
                              <td className="num">{formatCents(num(line.qtyPerPiece) * num(line.wasteFactor) * num(line.costPerUnitCents), { always: true })}</td>
                              <td className="num">
                                <form action={removeBomLineAction}><input type="hidden" name="id" value={product.id} /><input type="hidden" name="materialId" value={line.materialId} /><button className="wm-button" data-variant="danger" data-size="sm" type="submit">Remove</button></form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="wm-muted">No materials yet, so the cost below is only machine time and finishing.</p>}
                  {allMaterials.length ? (
                    <form action={setBomLineAction} className="wm-fields" style={{ marginTop: 14, alignItems: "end" }}>
                      <input type="hidden" name="id" value={product.id} />
                      <label className="wm-field">Material<select name="materialId">{allMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}</select></label>
                      <label className="wm-field">Quantity per piece<input name="qtyPerPiece" inputMode="decimal" placeholder="180" /></label>
                      <label className="wm-field">Waste factor<input name="wasteFactor" inputMode="decimal" defaultValue="1.1" /></label>
                      <div><button className="wm-button" data-variant="ghost" type="submit">Add or update</button></div>
                    </form>
                  ) : <p className="wm-small"><Link href="/materials">Add materials</Link> to build this product&apos;s cost.</p>}
                </section>

                <Assistant context={{ kind: "product", id: product.id }} current={{ name: product.name, material: product.material, note: product.note }} configured={anthropicSetup().configured} />
              </div>

              <div className="wm-stack">
                {product.image ? <img src={absoluteImage(product.image)} alt={product.name} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface-2)" }} /> : null}

                <section className="wm-card">
                  <header><h2 className="wm-display">Cost &amp; margin</h2></header>
                  <dl className="wm-kv">
                    <dt>Materials</dt><dd className="wm-mono">{formatCents(product.cost.materialsCents, { always: true })}</dd>
                    <dt>Machine time</dt><dd className="wm-mono">{formatCents(product.cost.machineCents, { always: true })} <span className="wm-muted">({num(product.printHours)} h × {formatCents(settings.machineRateCents, { always: true })})</span></dd>
                    <dt>Finishing</dt><dd className="wm-mono">{formatCents(product.cost.laborCents, { always: true })} <span className="wm-muted">({product.laborMinutes} min × {formatCents(settings.laborRateCents)}/h)</span></dd>
                    <dt><strong>Cost per piece</strong></dt><dd className="wm-mono"><strong>{formatCents(product.cost.totalCents, { always: true })}</strong></dd>
                    <dt>Price</dt><dd className="wm-mono">{formatCents(product.priceCents)}</dd>
                    <dt>Margin</dt><dd className="wm-mono">{margin === null ? "—" : `${Math.round(margin * 100)}% · ${formatCents(product.priceCents - product.cost.totalCents, { always: true })} a piece`}</dd>
                  </dl>
                  <p className="wm-muted wm-small" style={{ marginBottom: 0 }}>Rates live in <Link href="/settings">Settings</Link>.</p>
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">Finished stock</h2></header>
                  <dl className="wm-kv">
                    <dt>On the shelf</dt><dd className="wm-mono">{product.onHand}</dd>
                    <dt>Held by checkouts</dt><dd className="wm-mono">{product.reserved}</dd>
                    <dt>Free to sell</dt><dd className="wm-mono">{product.available}{product.madeToOrder ? " (then made to order)" : ""}</dd>
                  </dl>
                  <form action={adjustStockAction} className="wm-fields" style={{ marginTop: 16, alignItems: "end" }}>
                    <input type="hidden" name="id" value={product.id} />
                    <label className="wm-field">Add or remove<input name="delta" inputMode="numeric" placeholder="+3 or -1" /></label>
                    <label className="wm-field">Why<input name="note" placeholder="Stock count" /></label>
                    <div><button className="wm-button" data-variant="ghost" type="submit">Adjust</button></div>
                  </form>
                  <form action={saveThresholdAction} className="wm-fields" style={{ marginTop: 12, alignItems: "end" }}>
                    <input type="hidden" name="id" value={product.id} />
                    <label className="wm-field">Low-stock alert at<input name="lowThreshold" inputMode="numeric" defaultValue={product.lowThreshold} /></label>
                    <div><button className="wm-button" data-variant="ghost" type="submit">Save</button></div>
                  </form>
                  <p className="wm-muted wm-small">Finished batches add stock by themselves; <Link href="/production">plan one</Link>.</p>
                  {movements.length ? (
                    <ul className="wm-list">
                      {movements.map((movement) => (
                        <li key={movement.id}>
                          <span>{REASONS[movement.reason] ?? movement.reason}{movement.note ? ` · ${movement.note}` : ""}<br /><span className="wm-muted wm-small">{movement.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span>
                          <span className="wm-mono">{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
