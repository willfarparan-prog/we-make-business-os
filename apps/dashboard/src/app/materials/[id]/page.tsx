import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { moveMaterialAction, updateMaterialAction } from "@/app/actions/materials";
import { MaterialFields } from "@/components/materials/material-fields";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { materialMovements, materials, productMaterials, products } from "@/db/schema";
import { num } from "@/lib/costing";
import { isUuid } from "@/lib/forms";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = { opening: "Opening count", received: "Received", write_off: "Written off", batch_consumed: "Used in a batch" };

export default async function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="materials">
      {async ({ db }) => {
        const [material] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
        if (!material) notFound();
        const [movements, usedBy] = await Promise.all([
          db.select().from(materialMovements).where(eq(materialMovements.materialId, id)).orderBy(desc(materialMovements.createdAt)).limit(25),
          db.select({ id: products.id, name: products.name, qty: productMaterials.qtyPerPiece }).from(productMaterials).innerJoin(products, eq(products.id, productMaterials.productId)).where(eq(productMaterials.materialId, id)),
        ]);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`Material · ${material.kind}`} title={material.name}>
              <Link className="wm-button" data-variant="ghost" href="/materials">All materials</Link>
            </PageHead>
            <div className="wm-grid-2">
              <form action={updateMaterialAction} className="wm-card wm-form">
                <input type="hidden" name="id" value={material.id} />
                <MaterialFields material={material} />
                <div><button className="wm-button" type="submit">Save</button></div>
              </form>
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">{num(material.onHand).toLocaleString()} {material.unit}</h2><span className="wm-muted wm-small">on hand</span></header>
                  <form action={moveMaterialAction} className="wm-fields" style={{ alignItems: "end" }}>
                    <input type="hidden" name="id" value={material.id} />
                    <label className="wm-field">Amount<input name="delta" inputMode="decimal" placeholder="+1000 or -50" /></label>
                    <label className="wm-field">Note<input name="note" placeholder="Invoice #, spill…" /></label>
                    <div><button className="wm-button" data-variant="ghost" type="submit">Record</button></div>
                  </form>
                  {movements.length ? (
                    <ul className="wm-list" style={{ marginTop: 12 }}>
                      {movements.map((movement) => (
                        <li key={movement.id}>
                          <span>{REASONS[movement.reason] ?? movement.reason}{movement.note ? ` · ${movement.note}` : ""}<br /><span className="wm-muted wm-small">{movement.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span>
                          <span className="wm-mono">{num(movement.delta) > 0 ? "+" : ""}{num(movement.delta).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                <section className="wm-card">
                  <header><h2 className="wm-display">Used in</h2></header>
                  {usedBy.length ? <ul className="wm-list">{usedBy.map((product) => <li key={product.id}><Link href={`/products/${product.id}`}>{product.name}</Link><span className="wm-mono">{num(product.qty)} {material.unit} a piece</span></li>)}</ul> : <p className="wm-muted" style={{ margin: 0 }}>Not in any product yet. Add it from a product&apos;s page.</p>}
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
