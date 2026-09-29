/**
 * Applies the additive SQL in drizzle/*.sql (and, with --seed, seeds/*.sql) to a database.
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/migrate.ts            uses DATABASE_URL
 *   … scripts/migrate.ts --dry-run    prints the statements without running them
 *   … scripts/migrate.ts --seed       also runs seeds/*.sql (the launch products)
 *
 * Every file is written to be safe to run twice.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const dryRun = process.argv.includes("--dry-run");
const withSeeds = process.argv.includes("--seed");

/** Splits on semicolons that end a line; one-line DO $$ … $$ blocks stay whole. */
export function statements(sql: string) {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim().replace(/;$/, ""))
    .filter(Boolean);
}

async function main() {
  const directories = ["drizzle", ...(withSeeds ? ["seeds"] : [])];
  const url = process.env.DATABASE_URL;
  if (!dryRun && !url) throw new Error("DATABASE_URL is not set. Run with --env-file=.env.local.");
  const run = url && !dryRun ? neon(url) : null;

  for (const directory of directories) {
    const files = readdirSync(path.resolve(directory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const parts = statements(readFileSync(path.resolve(directory, file), "utf8"));
      console.log(`\n${directory}/${file} — ${parts.length} statements${dryRun ? " (dry run)" : ""}`);
      for (const statement of parts) {
        const label = statement.split("\n")[0].slice(0, 90);
        if (!run) {
          console.log(`  · ${label}`);
          continue;
        }
        await run.query(statement);
        console.log(`  ✓ ${label}`);
      }
    }
  }
  console.log(dryRun ? "\nDry run complete." : "\nDone.");
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
