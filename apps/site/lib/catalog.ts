/*
 * Server-side only (it's imported by server components and routes).
 *
 * The storefront's catalog comes from the We+Make dashboard, which owns
 * products, prices and stock. If the dashboard can't be reached, or answers
 * with nothing, the site shows the collection it launched with, so it never
 * goes blank. Checkout always charges the dashboard's live price.
 */

export type Product = {
  id: string;
  handle: string;
  name: string;
  category: string;
  material: string;
  price: number;
  note: string;
  image: string;
  available: boolean;
  madeToOrder: boolean;
  leadTime: string;
};

export type Catalog = { products: Product[]; freeShippingOver: number; live: boolean };

const DASHBOARD_URL = (process.env.WM_DASHBOARD_URL || 'https://we-make-business-dashboard.vercel.app').replace(/\/$/, '');
const PRODUCT_ASSET_HOST = 'https://we-make.vercel.app/products/we-make-material-edition';

export const FALLBACK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Arcadia Tall Planter',
    category: 'Planters',
    material: 'Wood composite · Resin',
    price: 118,
    note: 'An architectural planter framed in warm lattice, turquoise resin, and brass-tone inlay.',
    image: `${PRODUCT_ASSET_HOST}/arcadia-tall-planter.png`,
    handle: 'arcadia-tall-planter',
  },
  {
    id: '2',
    name: 'Tidal Mosaic Catchall',
    category: 'Table objects',
    material: 'Resin mosaic · Wood composite',
    price: 96,
    note: 'A hand-set turquoise mosaic field held by an ivory frame and fine brass edge.',
    image: `${PRODUCT_ASSET_HOST}/tidal-mosaic-catchall.png`,
    handle: 'tidal-mosaic-catchall',
  },
  {
    id: '3',
    name: 'Aurelia Dry-Stem Vase',
    category: 'Vases',
    material: 'Wood composite · Resin',
    price: 88,
    note: 'A twisting lattice vase crowned with a jewel-like turquoise resin collar.',
    image: `${PRODUCT_ASSET_HOST}/aurelia-dry-stem-vase.png`,
    handle: 'aurelia-dry-stem-vase',
  },
  {
    id: '4',
    name: 'Axis Desk Caddy',
    category: 'Desk objects',
    material: 'Wood composite · Resin',
    price: 76,
    note: 'A low architectural organizer with dedicated wells and brass-tone dividers.',
    image: `${PRODUCT_ASSET_HOST}/axis-desk-caddy.png`,
    handle: 'axis-desk-caddy',
  },
  {
    id: '5',
    name: 'Solstice Countertop Vessel',
    category: 'Kitchen decor',
    material: 'Wood composite · Resin',
    price: 82,
    note: 'A weighted countertop vessel finished with turquoise resin and a brass horizon.',
    image: `${PRODUCT_ASSET_HOST}/solstice-countertop-vessel.png`,
    handle: 'solstice-countertop-vessel',
  },
  {
    id: '6',
    name: 'Strata Gallery Tray',
    category: 'Table objects',
    material: 'Resin mosaic · Wood composite',
    price: 138,
    note: 'A long-format gallery tray with translucent mosaic and warm lattice handles.',
    image: `${PRODUCT_ASSET_HOST}/strata-gallery-tray.png`,
    handle: 'strata-gallery-tray',
  },
].map((product) => ({ ...product, available: true, madeToOrder: true, leadTime: 'Made to order in 2–3 weeks.' }));

const FALLBACK: Catalog = { products: FALLBACK_PRODUCTS, freeShippingOver: 250, live: false };

const str = (value: unknown) => (typeof value === 'string' ? value : null);

function readProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = str(row.id);
  const handle = str(row.handle);
  const name = str(row.name);
  const category = str(row.category);
  const image = str(row.image);
  const price = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
  if (!id || !handle || !name || !category || price === null) return null;
  return {
    id,
    handle,
    name,
    category,
    material: str(row.material) ?? '',
    note: str(row.note) ?? '',
    price,
    image: image && /^https:\/\//.test(image) ? image : '',
    available: row.available !== false,
    madeToOrder: row.madeToOrder !== false,
    leadTime: str(row.leadTime) ?? 'Made to order in 2–3 weeks.',
  };
}

export async function getCatalog(): Promise<Catalog> {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/catalog`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return FALLBACK;
    const body = (await response.json()) as { products?: unknown[]; shipping?: { freeOverCents?: unknown } };
    const products = (Array.isArray(body.products) ? body.products : []).map(readProduct).filter((product): product is Product => product !== null);
    if (products.length === 0) return FALLBACK;
    const freeOver = typeof body.shipping?.freeOverCents === 'number' ? Math.round(body.shipping.freeOverCents / 100) : 250;
    return { products, freeShippingOver: freeOver, live: true };
  } catch {
    return FALLBACK;
  }
}

/** Server-side forwarding to the dashboard, for the site's own API routes. */
export async function forwardToDashboard(path: string, request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  try {
    const response = await fetch(`${DASHBOARD_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) },
      body: await request.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ error: 'We couldn’t reach the studio just now. Please try again in a moment.' }, { status: 502 });
  }
}
