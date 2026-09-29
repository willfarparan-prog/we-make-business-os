import "server-only";
import Link from "next/link";
import type { ReactNode } from "react";
import { sql } from "drizzle-orm";
import { getDatabase, type Database } from "@/db";
import { requireOwner, type Viewer } from "@/lib/auth/owner";
import type { NavId } from "@/lib/navigation";
import { AppShell } from "./app-shell";

type Context = { viewer: Viewer; db: Database };

/**
 * Every owner page goes through here: it checks the viewer, finds the
 * database, and draws the shell. Without a database it says so plainly
 * instead of failing, so a fresh deploy still opens.
 */
export async function OwnerPage({ active, children }: { active: NavId; children: (context: Context) => Promise<ReactNode> | ReactNode }) {
  const viewer = await requireOwner();
  const db = getDatabase();
  if (!db) {
    return (
      <AppShell active={active} owner={viewer.email}>
        <div className="wm-card">
          <p className="wm-eyebrow">Setup</p>
          <h1 className="wm-display">The database isn&apos;t connected yet.</h1>
          <p className="wm-muted">Add DATABASE_URL to this deployment&apos;s environment and redeploy. Connections lists everything that&apos;s still missing.</p>
          <Link className="wm-button" href="/connections">Open Connections</Link>
        </div>
      </AppShell>
    );
  }
  const [counts] = (await db.execute(sql`select count(*) filter (where status = 'paid')::int as to_pack from orders`)).rows as Array<{ to_pack: number }>;
  const content = await children({ viewer, db });
  return (
    <AppShell active={active} owner={viewer.email} badges={{ orders: counts?.to_pack ?? 0 }}>
      {content}
    </AppShell>
  );
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Actions redirect back with ?notice= or ?error= so a plain form can report what happened. */
export async function Flash({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;
  if (!notice && !error) return null;
  return <div className="wm-notice" data-tone={error ? "bad" : undefined} role={error ? "alert" : "status"}>{error ?? notice}</div>;
}

export function PageHead({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="wm-page-head">
      <div>
        <p className="wm-eyebrow">{eyebrow}</p>
        <h1 className="wm-display">{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </div>
      {children ? <div className="wm-row">{children}</div> : null}
    </div>
  );
}

const TONES: Record<string, "good" | "warn" | "bad" | "info" | undefined> = {
  active: "good", paid: "warn", packed: "info", shipped: "good", delivered: "good", completed: "good", sent: "good", approved: "info",
  pending: undefined, draft: undefined, planned: undefined, idle: undefined,
  printing: "info", casting: "info", finishing: "info", qc: "info",
  expired: "bad", cancelled: "bad", refunded: "bad", archived: undefined, maintenance: "warn", offline: "bad",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className="wm-badge" data-tone={TONES[status]}>{label ?? status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}
