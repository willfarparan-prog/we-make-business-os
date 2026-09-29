import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { logMaintenanceAction, updatePrinterAction } from "@/app/actions/printers";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { PRINTER_STATUSES, maintenanceLogs, printers } from "@/db/schema";
import { num } from "@/lib/costing";
import { isUuid } from "@/lib/forms";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PrinterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="printers">
      {async ({ db }) => {
        const [printer] = await db.select().from(printers).where(eq(printers.id, id)).limit(1);
        if (!printer) notFound();
        const logs = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.printerId, id)).orderBy(desc(maintenanceLogs.performedAt)).limit(50);
        const nextDue = logs[0]?.nextDueHours ? num(logs[0].nextDueHours) : null;
        const hours = num(printer.totalPrintHours);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`Printer · ${printer.model || "model not set"}`} title={printer.name}>
              <StatusBadge status={printer.status} />
              <Link className="wm-button" data-variant="ghost" href="/printers">All printers</Link>
            </PageHead>
            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Maintenance log</h2>{nextDue !== null ? <span className="wm-badge" data-tone={hours >= nextDue ? "warn" : undefined}>Next at {nextDue.toLocaleString()} h</span> : null}</header>
                  {logs.length ? (
                    <ul className="wm-list">
                      {logs.map((log) => (
                        <li key={log.id}>
                          <span><strong>{log.kind}</strong>{log.notes ? ` · ${log.notes}` : ""}<br /><span className="wm-muted wm-small">{log.performedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at {num(log.hoursAt).toLocaleString()} h</span></span>
                          <span className="wm-mono">{log.costCents ? formatCents(log.costCents, { always: true }) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="wm-muted">Nothing logged yet.</p>}
                  <form action={logMaintenanceAction} className="wm-form" style={{ marginTop: 16 }}>
                    <input type="hidden" name="id" value={printer.id} />
                    <div className="wm-fields">
                      <label className="wm-field">What was done<input name="kind" placeholder="Nozzle swap" /></label>
                      <label className="wm-field">Parts cost (USD)<input name="cost" inputMode="decimal" placeholder="0" /></label>
                      <label className="wm-field">Due again in (hours)<input name="everyHours" inputMode="decimal" placeholder="250" /></label>
                    </div>
                    <label className="wm-field">Notes<input name="notes" /></label>
                    <div><button className="wm-button" data-variant="ghost" type="submit">Log maintenance</button></div>
                  </form>
                </section>
              </div>
              <form action={updatePrinterAction} className="wm-card wm-form">
                <header><h2 className="wm-display">Details</h2></header>
                <input type="hidden" name="id" value={printer.id} />
                <label className="wm-field">Name<input name="name" required defaultValue={printer.name} /></label>
                <label className="wm-field">Model<input name="model" defaultValue={printer.model} /></label>
                <label className="wm-field">Status<select name="status" defaultValue={printer.status}>{PRINTER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label className="wm-field">Print hours<input name="totalPrintHours" inputMode="decimal" defaultValue={printer.totalPrintHours} /><small>Completed batches add to this by themselves.</small></label>
                <label className="wm-field">Notes<textarea name="notes" defaultValue={printer.notes ?? ""} style={{ minHeight: 70 }} /></label>
                <div><button className="wm-button" type="submit">Save</button></div>
              </form>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
