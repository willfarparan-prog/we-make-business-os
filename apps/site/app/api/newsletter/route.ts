import { forwardToDashboard } from '@/lib/catalog';

/** "Notes from the studio" signups are kept by the dashboard. */
export async function POST(request: Request) {
  return forwardToDashboard('/api/newsletter', request);
}
