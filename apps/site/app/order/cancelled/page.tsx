import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Checkout cancelled — We+Make', robots: { index: false } };

export default function OrderCancelled() {
  return (
    <main className="order-page">
      <a className="wordmark" href="/">
        We<span>+</span>Make
      </a>
      <p className="eyebrow">Checkout cancelled</p>
      <h1>Your bag is still here.</h1>
      <p>Nothing was charged. The pieces you chose are waiting in your bag whenever you&apos;re ready.</p>
      <a className="primary-link" href="/#shop">
        Return to the collection <ArrowRight />
      </a>
    </main>
  );
}
