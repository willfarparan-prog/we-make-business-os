import { neon } from "@neondatabase/serverless";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = ReturnType<typeof neonDatabase>;

function neonDatabase(url: string) {
  return drizzle(neon(url), { schema });
}

const sandbox = globalThis as typeof globalThis & { __wmSandboxDb?: Database };

/**
 * Local testing only: `next dev` with WM_LOCAL_DB=.local-db uses the PGlite
 * sandbox opened in src/instrumentation.ts instead of the live Neon database.
 * Tests hand in an in-memory one the same way.
 */
export function setSandboxDatabase(db: unknown) {
  sandbox.__wmSandboxDb = db as Database;
}

export function getDatabase(): Database | null {
  if (process.env.NODE_ENV !== "production" && process.env.WM_LOCAL_DB) {
    if (!sandbox.__wmSandboxDb) throw new Error("WM_LOCAL_DB is set but the sandbox database isn't open. Run pnpm db:local first.");
    return sandbox.__wmSandboxDb;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  return neonDatabase(databaseUrl);
}

/** The database or a clear error, for code paths that can't do anything without one. */
export function requireDatabase(): Database {
  const db = getDatabase();
  if (!db) throw new Error("The database isn't connected. Set DATABASE_URL.");
  return db;
}

/**
 * Runs raw statements as one all-or-nothing unit and returns each result's rows.
 *
 * Neon's HTTP driver has transactional batches but no interactive
 * transactions; PGlite (local preview and tests) has the opposite. Stock and
 * order changes are written as self-contained SQL so they work under both.
 */
export async function atomic<Row extends Record<string, unknown> = Record<string, unknown>>(db: Database, statements: SQL[]): Promise<Row[][]> {
  if (statements.length === 0) return [];
  if (typeof (db as { batch?: unknown }).batch === "function") {
    const [first, ...rest] = statements.map((statement) => db.execute<Row>(statement));
    const results = await db.batch([first, ...rest]);
    return results.map((result) => (result as { rows: Row[] }).rows);
  }
  return db.transaction(async (tx) => {
    const out: Row[][] = [];
    for (const statement of statements) out.push((await tx.execute<Row>(statement)).rows);
    return out;
  });
}
