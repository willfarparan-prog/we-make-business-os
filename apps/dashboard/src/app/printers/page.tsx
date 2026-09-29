import Link from "next/link";
import { asc } from "drizzle-orm";
import { createPrinterAction } from "@/app/actions/printers";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { printers } from "@/db/schema";
import { num } from "@/lib/costing";
import { printersDue } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Printers" };

export default function PrintersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="printers">
      {async ({ db }) => {
        const [rows, due] = await Promise.all([db.select().from(printers).orderBy(asc(printers.name)), printersDue(db)]);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Workshop" title="Printers" intro="Each printer's hours grow as batches complete. Log a service with its interval and the dashboard tells you when the next one is due." />
            <section className="wm-card wm-card-flush" style={{ marginBottom: 20 }}>
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th>Printer</th><th>Status</th><th className="num">Print hours</th><th>Service</th></tr></thead>
                  <tbody>
                    {rows.map((printer) => (
                      <tr key={printer.id}>
                        <td><Link href={`/printers/${printer.id}`}>{printer.name}</Link><div className="wm-muted wm-small">{printer.model}</div></td>
                        <td><StatusBadge status={printer.status} /></td>
                        <td className="num">{num(printer.totalPrintHours).toLocaleString()}</td>
                        <td>{due.some((row) => row.id === printer.id) ? <span className="wm-badge" data-tone="warn">Due</span> : <span className="wm-muted wm-small">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">No printers yet.</p> : null}
              </div>
            </section>
            <form action={createPrinterAction} className="wm-card wm-form" style={{ maxWidth: 760 }}>
              <header><h2 className="wm-display">Add a printer</h2></header>
              <div className="wm-fields">
                <label className="wm-field">Name<input name="name" required placeholder="Printer 1" /></label>
                <label className="wm-field">Model<input name="model" placeholder="Make and model" /></label>
                <label className="wm-field">Hours so far<input name="totalPrintHours" inputMode="decimal" placeholder="0" /></label>
              </div>
              <div><button className="wm-button" type="submit">Add printer</button></div>
            </form>
          </>
        );
      }}
    </OwnerPage>
  );
}
