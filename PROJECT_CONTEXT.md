# We+Make Business OS: project context

## What this is
We+Make is a small-batch design studio making sculptural decor: planters, vases, trays, catchalls and desk objects. The forms are 3D printed (wood composite, PETG), then finished by hand: resin cast into cavities, sanded, set with mosaic, inlaid with brass-tone detail. Everything is sold as finished products; most are made to order in 2–3 weeks.

This repo holds:

| App | Vercel project | URL | Purpose |
|---|---|---|---|
| `apps/site` | `we-make` | we-make.vercel.app (also lumaform-beta.vercel.app) | The storefront |
| `apps/dashboard` | `we-make-business-dashboard` | we-make-business-dashboard.vercel.app | The owner's dashboard |

It was modelled on the Diamond Edge Athletics gym dashboard, which was used for reference only and never changed.

## How the two apps connect
- **Catalog.** The dashboard owns products, prices and stock. The site reads `GET /api/catalog` (cached 60 s). If that fails or comes back empty, the site shows the six launch products built into `apps/site/lib/catalog.ts`, so it never goes blank.
- **Checkout.** The site's `/api/checkout` forwards the bag to the dashboard. The dashboard:
  - prices the bag from the database;
  - holds stock-only pieces on the shelf;
  - creates a Stripe Checkout Session (US shipping; free from $250, flat rate below);
  - redirects the shopper to Stripe.
- **After Stripe.** Stripe returns shoppers to `/order/success` or `/order/cancelled` on the site. The Stripe webhook (`/api/webhooks/stripe`) marks the order paid, takes stock off the shelf once, records the payment and adds the buyer as a customer. Buying is **not** newsletter consent.
- **Newsletter.** The site's `/api/newsletter` forwards signups; the dashboard records consent with the IP.

## Decisions (2026-09-29)
- **Scope:** finished decor products only. No custom print jobs, design services or wholesale.
- **Payments:** Stripe on a new We+Make account, kept separate from the gym's. Test mode until `WM_STRIPE_LIVE=1`. Shopify is gone; its store was answering 402.
- **Database:** Neon project `we-make-business` in Will's own Neon org (not Vercel-managed), so migrations can be run directly. Auth is Neon Auth, owner-only (`WM_OWNER_EMAIL`), and the email must be verified.
- **Stock:**
  - **Made-to-order** products (the default) sell when the shelf is empty; the shortfall appears as "to make" on the order and in Production.
  - **Stock-only** products show "Sold out" at zero.
- **Email:** newsletter sending stays **off** until a real sending domain is set up. It has three modes: off / test (owner only) / live (approved issues to consented subscribers). Live requires the studio's mailing address.
- **Claude assistant:** on the product and newsletter pages. It only proposes changes; the owner clicks Apply. It stays off until `ANTHROPIC_API_KEY` is set.
- **Preview deployments** of the dashboard are skipped (`vercel.json` ignoreCommand), because they would share the production database and keys.

## Where things live (dashboard)
- **Schema:** `src/db/schema.ts`, mirrored by `drizzle/*.sql`. Seed data is in `seeds/launch-products.sql`.
- **Stock and orders:** `src/lib/inventory.ts`, `src/lib/orders/checkout.ts`, `src/lib/orders/stripe-events.ts`.
- **Costs:** `src/lib/costing.ts`. Cost per piece = materials × waste + print hours × machine rate + finishing minutes × labor rate.
- **Email:** `src/lib/email/*`.
- **Assistant:** `src/lib/anthropic.ts`, `src/lib/assistant/*`, `src/app/api/assistant`.
- **Tests:** `scripts/tests/*.test.ts` (in-memory Postgres, fake Stripe, captured email).

## Waiting on Will
- [ ] **Create the empty private GitHub repo** and allow the Vercel GitHub app to access it.
- [ ] **Paste the database and sign-in secrets into Vercel.** Project `we-make-business-dashboard` → Settings → Environment Variables (Production): `DATABASE_URL` and `NEON_AUTH_COOKIE_SECRET`.
- [ ] **Set up Stripe:**
  - Create the new We+Make Stripe account.
  - Add the webhook endpoint (URL and events are on the dashboard's Connections page).
  - Paste `STRIPE_SECRET_KEY` (sk_test_…) and `STRIPE_WEBHOOK_SECRET` into Vercel.
- [ ] **Sign in once** as the owner and verify the email.
- [ ] **Enter real data:** material costs, printers, print hours and finishing minutes per product. Until then, margins show machine time and labor only.
- [ ] **Later:**
  - A Resend key plus a verified sending domain, and the studio mailing address.
  - `ANTHROPIC_API_KEY`.
  - Stripe live mode, and whether to charge sales tax (Stripe Tax).

## Known limits
- **No sales tax** is calculated yet.
- **Site prices can lag** by up to about a minute after a change; Stripe always charges the current price.
- **Refunds** are issued in Stripe; the dashboard records them automatically. Putting a returned piece back in stock is a button on the refunded order.
