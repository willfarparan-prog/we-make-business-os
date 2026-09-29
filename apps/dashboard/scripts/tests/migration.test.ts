/** The production SQL must build exactly the schema the app is written against, and be safe to run twice. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import * as schema from "@/db/schema";
import { LAUNCH_PRODUCTS } from "@/lib/seed-products";
import { statements } from "../migrate";

function run(client: PGlite, directory: string) {
  return (async () => {
    for (const file of readdirSync(path.resolve(directory)).filter((name) => name.endsWith(".sql")).sort()) {
      for (const statement of statements(readFileSync(path.resolve(directory, file), "utf8"))) {
        await client.exec(statement).catch((error: unknown) => {
          throw new Error(`${file}: ${statement.split("\n")[0]} → ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
  })();
}

/** Every table, column, index and constraint in the public schema, as text that can be compared. */
async function describe(client: PGlite) {
  const columns = await client.query<Record<string, unknown>>(`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_identity, identity_start, numeric_precision, numeric_scale
    from information_schema.columns where table_schema = 'public' order by table_name, column_name`);
  const indexes = await client.query<Record<string, unknown>>(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname`);
  const constraints = await client.query<Record<string, unknown>>(`
    select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
    from pg_constraint where connamespace = 'public'::regnamespace order by conname`);
  return { columns: columns.rows, indexes: indexes.rows, constraints: constraints.rows };
}

test("drizzle/*.sql builds exactly the schema in src/db/schema.ts, and runs twice cleanly", async () => {
  const fromSchema = new PGlite();
  const { apply } = await pushSchema(schema, drizzle({ client: fromSchema, schema }) as never);
  await apply();

  const fromMigrations = new PGlite();
  await run(fromMigrations, "drizzle");
  await run(fromMigrations, "drizzle");

  const [expected, actual] = await Promise.all([describe(fromSchema), describe(fromMigrations)]);
  assert.ok(expected.columns.length > 100);
  assert.deepEqual(actual.columns, expected.columns, "columns drifted");
  assert.deepEqual(actual.indexes, expected.indexes, "indexes drifted");
  assert.deepEqual(actual.constraints, expected.constraints, "constraints drifted");
  await Promise.all([fromSchema.close(), fromMigrations.close()]);
});

test("the launch-product seed runs twice and matches the storefront's six pieces", async () => {
  const client = new PGlite();
  await run(client, "drizzle");
  await run(client, "seeds");
  await run(client, "seeds");
  const products = await client.query<{ handle: string; price_cents: number; stock: number }>(
    "select p.handle, p.price_cents, s.on_hand as stock from products p join product_stock s on s.product_id = p.id order by p.sort_order",
  );
  assert.deepEqual(products.rows.map((row) => row.handle), LAUNCH_PRODUCTS.map((product) => product.handle));
  assert.deepEqual(products.rows.map((row) => row.price_cents), LAUNCH_PRODUCTS.map((product) => product.priceCents));
  assert.ok(products.rows.every((row) => row.stock === 0));
  await client.close();
});
