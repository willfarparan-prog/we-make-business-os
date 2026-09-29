import { NextResponse } from 'next/server';

const SHOPIFY_STORE = 'https://gb5eqx-bs.myshopify.com';

type CheckoutItem = {
  handle?: unknown;
  quantity?: unknown;
};

type ShopifyProduct = {
  variants?: Array<{ id?: number }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: CheckoutItem[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];

    if (!items.length) {
      return NextResponse.json(
        { error: 'Your bag is empty.' },
        { status: 400 },
      );
    }

    const lines = await Promise.all(
      items.map(async (item) => {
        const handle =
          typeof item.handle === 'string' &&
          /^[a-z0-9][a-z0-9-]*$/.test(item.handle)
            ? item.handle
            : null;
        const quantity =
          typeof item.quantity === 'number'
            ? Math.min(10, Math.max(1, Math.floor(item.quantity)))
            : 1;

        if (!handle) return null;

        const response = await fetch(`${SHOPIFY_STORE}/products/${handle}.js`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) return null;

        const product = (await response.json()) as ShopifyProduct;
        const variantId = product.variants?.[0]?.id;
        return variantId ? `${variantId}:${quantity}` : null;
      }),
    );

    const validLines = lines.filter((line): line is string => Boolean(line));

    if (!validLines.length) {
      return NextResponse.json({ url: `${SHOPIFY_STORE}/collections/all` });
    }

    return NextResponse.json({
      url: `${SHOPIFY_STORE}/cart/${validLines.join(',')}`,
    });
  } catch {
    return NextResponse.json({ url: `${SHOPIFY_STORE}/collections/all` });
  }
}
