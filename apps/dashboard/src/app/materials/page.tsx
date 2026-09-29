import Link from "next/link";
import { asc } from "drizzle-orm";
import { createMaterialAction, moveMaterialAction } from "@/app/actions/materials";
import { MaterialFields } from "@/components/materials/material-fields";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { materials } from "@/db/schema";
import { num } from "@/lib/costing";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materials" };

export default function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="materials">
      {async ({ db }) => {
        const rows = await db.select().from(materials).orderBy(asc(materials.kind), asc(materials.name));
        const stockValue = rows.reduce((sum, row) => sum + Math.max(0, num(row.onHand)) * num(row.costPerUnitCents), 0);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Workshop" title="Materials" intro={`Filament, resin, pigment, sheet and packaging. Completed batches draw these down; receiving a delivery tops them up. On hand is worth about ${formatCents(stockValue)}.`} />
            <section className="wm-card wm-card-flush" style={{ marginBottom: 20 }}>
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th>Material</th><th>Kind</th><th className="num">On hand</th><th className="num">Reorder at</th><th className="num">Cost / unit</th><th>Receive or write off</th></tr></thead>
                  <tbody>
                    {rows.map((row) => {
                      const low = num(row.reorderPoint) > 0 && num(row.onHand) <= num(row.reorderPoint);
                      return (
                        <tr key={row.id}>
                          <td><Link href={`/materials/${row.id}`}>{row.name}</Link>{row.sku ? <div className="wm-muted wm-small">{row.sku}</div> : null}</td>
                          <td className="wm-small">{row.kind}</td>
                          <td className="num">{low ? <span className="wm-badge" data-tone="warn">{num(row.onHand).toLocaleString()} {row.unit}</span> : `${num(row.onHand).toLocaleString()} ${row.unit}`}</td>
                          <td className="num">{num(row.reorderPoint) ? `${num(row.reorderPoint).toLocaleString()} ${row.unit}` : "—"}</td>
                          <td className="num">{num(row.costPerUnitCents)}¢</td>
                          <td>
                            <form action={moveMaterialAction} className="wm-row">
                              <input type="hidden" name="id" value={row.id} /><input type="hidden" name="returnTo" value="list" />
                              <input className="wm-input" name="delta" inputMode="decimal" placeholder="+1000" style={{ width: 90 }} />
                              <button className="wm-button" data-variant="ghost" data-size="sm" type="submit">Record</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">No materials yet. Add what you buy, with its real cost, so each product&apos;s cost per piece adds up.</p> : null}
              </div>
            </section>
            <form action={createMaterialAction} className="wm-card wm-form">
              <header><h2 className="wm-display">Add a material</h2></header>
              <MaterialFields />
              <label className="wm-field" style={{ maxWidth: 240 }}>On hand now<input name="onHand" inputMode="decimal" placeholder="0" /></label>
              <div><button className="wm-button" type="submit">Add material</button></div>
            </form>
          </>
        );
      }}
    </OwnerPage>
  );
}
