import "server-only";

import Stripe from "stripe";

/*
 * The one door to Stripe.
 *
 * Test mode only until WM_STRIPE_LIVE=1 is set on purpose: a live key can't
 * charge anybody from this app by accident. The same switch decides which
 * webhook events the ledger keeps, so test charges never count as revenue in a
 * live store and live charges never land in a test setup.
 */

export type StripeMode = "test" | "live";

export function allowedStripeMode(): StripeMode {
  return process.env.WM_STRIPE_LIVE === "1" ? "live" : "test";
}

/** The mode a key belongs to, or null for something that isn't a Stripe secret key. */
export function keyMode(key: string | undefined): StripeMode | null {
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}

export type StripeAccess = { ok: true; stripe: Stripe; mode: StripeMode } | { ok: false; reason: string };

let cached: { key: string; stripe: Stripe } | null = null;
let override: Stripe | null = null;

/** Tests hand in a fake client so nothing ever calls Stripe. */
export function setStripeClientForTests(client: Stripe | null) {
  override = client;
}

export function stripeClient(): StripeAccess {
  if (override) return { ok: true, stripe: override, mode: "test" };

  const key = process.env.STRIPE_SECRET_KEY;
  const mode = keyMode(key);
  if (!key || !mode) return { ok: false, reason: "Stripe isn't connected. Add a test secret key (sk_test_…) as STRIPE_SECRET_KEY." };
  if (mode === "live" && allowedStripeMode() !== "live") {
    return { ok: false, reason: "Stripe has a live key, but this store runs in test mode. Use a test key, or set WM_STRIPE_LIVE=1 when you're ready to take real money." };
  }
  if (cached?.key !== key) cached = { key, stripe: new Stripe(key) };
  return { ok: true, stripe: cached.stripe, mode };
}

/** Whether an incoming webhook event belongs to the mode we're allowed to record. */
export function eventModeAllowed(livemode: boolean): boolean {
  return livemode === (allowedStripeMode() === "live");
}
