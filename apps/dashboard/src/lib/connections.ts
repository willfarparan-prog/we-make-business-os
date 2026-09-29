import "server-only";
import { anthropicSetup } from "@/lib/anthropic";
import { emailSetup } from "@/lib/email/send";
import { allowedStripeMode, keyMode } from "@/lib/payments/stripe";

/** Which outside services are wired up. Booleans and modes only; no secret leaves this. */
export function connectionStatus() {
  const stripeKeyMode = keyMode(process.env.STRIPE_SECRET_KEY);
  return {
    database: Boolean(process.env.DATABASE_URL) || Boolean(process.env.WM_LOCAL_DB),
    neonAuth: Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET),
    owner: Boolean(process.env.WM_OWNER_EMAIL),
    stripe: stripeKeyMode !== null && (stripeKeyMode === "test" || allowedStripeMode() === "live"),
    stripeMode: stripeKeyMode,
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    resend: emailSetup().configured,
    anthropic: anthropicSetup().configured,
    assistantModel: anthropicSetup().model,
    siteUrl: process.env.WM_SITE_URL || "https://we-make.vercel.app (default)",
  };
}
