import { forwardToDashboard } from '@/lib/catalog';

/** The bag goes to the dashboard, which prices it from its own catalog and opens Stripe Checkout. */
export async function POST(request: Request) {
  return forwardToDashboard('/api/checkout', request);
}
