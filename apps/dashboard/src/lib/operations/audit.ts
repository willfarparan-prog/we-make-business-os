import "server-only";
import { desc } from "drizzle-orm";
import type { Database } from "@/db";
import { auditEvents } from "@/db/schema";

type AuditValue = string | number | boolean | null;

export type AuditInput = {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, AuditValue>;
};

const clean = (value: string, limit: number) => value.trim().slice(0, limit);

/** Store a concise operational change record, never arbitrary request payloads. */
export async function recordAudit(db: Database, input: AuditInput) {
  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {})
      .slice(0, 12)
      .map(([key, value]) => [clean(key, 60), typeof value === "string" ? clean(value, 240) : value]),
  );
  await db.insert(auditEvents).values({
    actorEmail: clean(input.actorEmail.toLowerCase(), 320),
    action: clean(input.action, 80),
    entityType: clean(input.entityType, 80),
    entityId: input.entityId ? clean(input.entityId, 160) : null,
    summary: clean(input.summary, 320),
    metadata,
  });
}

export async function recentAudit(db: Database, limit = 100) {
  return db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 300));
}
