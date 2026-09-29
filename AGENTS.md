# We+Make Business OS: notes for agents

Two Next.js apps in one pnpm workspace (Node 24, pnpm 11):

- `apps/dashboard`: the owner's dashboard, Vercel project **we-make-business-dashboard**.
- `apps/site`: the storefront, Vercel project **we-make** (we-make.vercel.app).

Read `PROJECT_CONTEXT.md` first: it records the decisions, what's live, and what's waiting on Will.

## Rules
- **This repo has nothing to do with the gym.** The Diamond Edge Athletics repo and its Vercel projects (`gym-business-dashboard`, `diamond-edge-athletics`) were only a reference. Never change them from here. `scripts/tests/policy.test.ts` fails if gym names, env prefixes or project ids leak in.
- **Money is integer cents.** Material quantities and per-unit costs are Postgres numerics (strings in JS; parse with `num()`).
- **Stock is changed only by guarded SQL** in `src/lib/inventory.ts` and `src/lib/orders/*`. Every write there is safe to repeat (webhook retries, double clicks). Keep it that way.
- **Checkout prices come from the database**, never the browser.
- **Migrations are additive and idempotent.** Edit `src/db/schema.ts` and add a new `drizzle/<date>-<name>.sql` together; `migration.test.ts` fails if they differ.
- **`"use server"` files export only async functions.** A test checks this.
- **Email is off until a real sending domain exists.** Don't switch it to Live or send to real people without Will.

## Running things
```
export PATH="$HOME/.local/node/bin:$PATH"
pnpm install
pnpm check                      # lint, typecheck, tests, both builds
cd apps/dashboard && node node_modules/tsx/dist/cli.mjs scripts/local-db.ts --reset   # sandbox with sample data
```
Dashboard against the sandbox (no sign-in):
```
WM_LOCAL_DB=.local-db WM_DEV_PREVIEW=1 WM_OWNER_EMAIL=owner@preview.local \
NEON_AUTH_BASE_URL=http://127.0.0.1:9/auth NEON_AUTH_COOKIE_SECRET=$(openssl rand -hex 32) \
NODE_OPTIONS= node node_modules/next/dist/bin/next dev -p 3140
```
Storefront against it: `WM_DASHBOARD_URL=http://localhost:3140 NODE_OPTIONS= node node_modules/next/dist/bin/next dev -p 3240` in `apps/site`.
