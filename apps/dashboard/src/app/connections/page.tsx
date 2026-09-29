import { OwnerPage, PageHead } from "@/components/page";
import { connectionStatus } from "@/lib/connections";
import { HANDLED_EVENTS } from "@/lib/orders/stripe-events";
import { dashboardUrl, siteUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections" };

function Row({ ok, name, detail, fix }: { ok: boolean; name: string; detail: string; fix?: string }) {
  return (
    <li>
      <span><strong>{name}</strong><br /><span className="wm-muted wm-small">{ok ? detail : fix ?? detail}</span></span>
      <span className="wm-badge" data-tone={ok ? "good" : "warn"}>{ok ? "Connected" : "Not set"}</span>
    </li>
  );
}

export default function ConnectionsPage() {
  return (
    <OwnerPage active="connections">
      {() => {
        const status = connectionStatus();
        const webhookUrl = `${dashboardUrl()}/api/webhooks/stripe`;
        return (
          <>
            <PageHead eyebrow="Setup" title="Connections" intro="What this dashboard is wired to. Secrets are set in Vercel's environment variables and never shown here." />
            <div className="wm-grid-2">
              <section className="wm-card">
                <ul className="wm-list">
                  <Row ok={status.database} name="Database (Neon)" detail="Orders, stock, customers and everything else." fix="Set DATABASE_URL." />
                  <Row ok={status.neonAuth} name="Sign-in (Neon Auth)" detail="Owner sign-in." fix="Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET." />
                  <Row ok={status.owner} name="Owner" detail="WM_OWNER_EMAIL is the one account that opens the dashboard." fix="Set WM_OWNER_EMAIL." />
                  <Row ok={status.stripe} name={`Stripe${status.stripeMode ? ` (${status.stripeMode} mode)` : ""}`} detail="Checkout on the storefront." fix="Set STRIPE_SECRET_KEY to the new We+Make account's sk_test_… key." />
                  <Row ok={status.stripeWebhook} name="Stripe webhook" detail="Paid orders arrive here." fix="Create the endpoint below in Stripe, then set STRIPE_WEBHOOK_SECRET." />
                  <Row ok={status.resend} name="Email (Resend)" detail="Newsletter sending." fix="Set RESEND_API_KEY once a sending domain is verified." />
                  <Row ok={status.anthropic} name={`Claude assistant (${status.assistantModel})`} detail="Product and newsletter copy." fix="Set ANTHROPIC_API_KEY." />
                </ul>
              </section>
              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Stripe webhook</h2></header>
                  <p className="wm-small" style={{ marginTop: 0 }}>In Stripe → Developers → Webhooks, add an endpoint at:</p>
                  <p><code style={{ overflowWrap: "anywhere" }}>{webhookUrl}</code></p>
                  <p className="wm-small">listening for:</p>
                  <ul className="wm-small">{HANDLED_EVENTS.map((event) => <li key={event}><code>{event}</code></li>)}</ul>
                </section>
                <section className="wm-card">
                  <header><h2 className="wm-display">Storefront</h2></header>
                  <dl className="wm-kv wm-small">
                    <dt>Site</dt><dd><a href={siteUrl()} target="_blank" rel="noreferrer">{siteUrl()}</a></dd>
                    <dt>Catalog feed</dt><dd><a href="/api/catalog" target="_blank" rel="noreferrer">/api/catalog</a></dd>
                    <dt>Health</dt><dd><a href="/api/health" target="_blank" rel="noreferrer">/api/health</a></dd>
                  </dl>
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
