import { connectionStatus } from "@/lib/connections";

/** Public and cheap: which services are configured, never their values. */
export function GET() {
  const status = connectionStatus();
  return Response.json(
    {
      status: "ok",
      services: {
        neon: status.database,
        neonAuth: status.neonAuth,
        stripe: status.stripe,
        stripeMode: status.stripeMode,
        stripeWebhook: status.stripeWebhook,
        resend: status.resend,
        anthropic: status.anthropic,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
