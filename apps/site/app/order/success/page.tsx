import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { ClearBag } from '../clear-bag';

export const metadata: Metadata = { title: 'Thank you — We+Make', robots: { index: false } };
export const dynamic = 'force-dynamic';

const DASHBOARD_URL = (process.env.WM_DASHBOARD_URL || 'https://we-make-business-dashboard.vercel.app').replace(/\/$/, '');

async function orderNumber(sessionId: string) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return null;
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { number?: string };
    return body.number ?? null;
  } catch {
    return null;
  }
}

export default async function OrderSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId = '' } = await searchParams;
  const number = await orderNumber(sessionId);
  return (
    <main className="order-page">
      <ClearBag />
      <a className="wordmark" href="/">
        We<span>+</span>Make
      </a>
      <p className="eyebrow">{number ? `Order ${number}` : 'Order received'}</p>
      <h1>Thank you.</h1>
      <p>
        Your order is in the studio. A receipt is on its way to your inbox, and we&apos;ll email tracking when your piece
        ships. Made-to-order pieces take two to three weeks to finish by hand.
      </p>
      <p>
        Questions? <a href="mailto:hello@wemake.studio">hello@wemake.studio</a>
      </p>
      <a className="primary-link" href="/#shop">
        Back to the collection <ArrowRight />
      </a>
    </main>
  );
}
