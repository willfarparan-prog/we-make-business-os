'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { EDITORIAL_IMAGE } from '@/lib/editorial-image';

type Product = {
  id: number;
  name: string;
  category: string;
  material: string;
  price: number;
  note: string;
  image: string;
  handle: string;
};

const PRODUCT_ASSET_HOST =
  'https://we-make.vercel.app/products/we-make-material-edition';

const products: Product[] = [
  {
    id: 1,
    name: 'Arcadia Tall Planter',
    category: 'Planters',
    material: 'Wood composite · Resin',
    price: 118,
    note: 'An architectural planter framed in warm lattice, turquoise resin, and brass-tone inlay.',
    image: `${PRODUCT_ASSET_HOST}/arcadia-tall-planter.png`,
    handle: 'arcadia-tall-planter',
  },
  {
    id: 2,
    name: 'Tidal Mosaic Catchall',
    category: 'Table objects',
    material: 'Resin mosaic · Wood composite',
    price: 96,
    note: 'A hand-set turquoise mosaic field held by an ivory frame and fine brass edge.',
    image: `${PRODUCT_ASSET_HOST}/tidal-mosaic-catchall.png`,
    handle: 'tidal-mosaic-catchall',
  },
  {
    id: 3,
    name: 'Aurelia Dry-Stem Vase',
    category: 'Vases',
    material: 'Wood composite · Resin',
    price: 88,
    note: 'A twisting lattice vase crowned with a jewel-like turquoise resin collar.',
    image: `${PRODUCT_ASSET_HOST}/aurelia-dry-stem-vase.png`,
    handle: 'aurelia-dry-stem-vase',
  },
  {
    id: 4,
    name: 'Axis Desk Caddy',
    category: 'Desk objects',
    material: 'Wood composite · Resin',
    price: 76,
    note: 'A low architectural organizer with dedicated wells and brass-tone dividers.',
    image: `${PRODUCT_ASSET_HOST}/axis-desk-caddy.png`,
    handle: 'axis-desk-caddy',
  },
  {
    id: 5,
    name: 'Solstice Countertop Vessel',
    category: 'Kitchen decor',
    material: 'Wood composite · Resin',
    price: 82,
    note: 'A weighted countertop vessel finished with turquoise resin and a brass horizon.',
    image: `${PRODUCT_ASSET_HOST}/solstice-countertop-vessel.png`,
    handle: 'solstice-countertop-vessel',
  },
  {
    id: 6,
    name: 'Strata Gallery Tray',
    category: 'Table objects',
    material: 'Resin mosaic · Wood composite',
    price: 138,
    note: 'A long-format gallery tray with translucent mosaic and warm lattice handles.',
    image: `${PRODUCT_ASSET_HOST}/strata-gallery-tray.png`,
    handle: 'strata-gallery-tray',
  },
];

const categories = [
  'All objects',
  'Planters',
  'Table objects',
  'Vases',
  'Desk objects',
  'Kitchen decor',
];
const navItems = [
  ['Shop', '#shop'],
  ['Collections', '#collections'],
  ['Materials', '#materials'],
  ['Our studio', '#studio'],
];

function ProductImage({
  product,
  className = '',
}: {
  product: Product;
  className?: string;
}) {
  return (
    <div className={`product-image ${className}`}>
      <img
        src={product.image}
        alt={product.name}
      />
    </div>
  );
}

export default function Home() {
  const [filter, setFilter] = useState('All objects');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<Product | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          (filter === 'All objects' || product.category === filter) &&
          `${product.name} ${product.material}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [filter, query],
  );

  const bagItems = products.filter((product) => cart[product.id]);
  const bagCount = Object.values(cart).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const subtotal = bagItems.reduce(
    (total, product) => total + product.price * cart[product.id],
    0,
  );

  const addToBag = (product: Product) => {
    setCart((current) => ({
      ...current,
      [product.id]: (current[product.id] || 0) + 1,
    }));
    setSelected(null);
    setBagOpen(true);
  };

  const updateQuantity = (id: number, amount: number) => {
    setCart((current) => {
      const quantity = Math.max(0, (current[id] || 0) + amount);
      const next = { ...current, [id]: quantity };
      if (!quantity) delete next[id];
      return next;
    });
  };

  const submitNewsletter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJoined(true);
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: bagItems.map((product) => ({
            handle: product.handle,
            quantity: cart[product.id],
          })),
        }),
      });
      const data = (await response.json()) as { url?: string };
      window.location.assign(
        data.url || 'https://gb5eqx-bs.myshopify.com/collections/all',
      );
    } catch {
      window.location.assign('https://gb5eqx-bs.myshopify.com/collections/all');
    }
  };

  return (
    <main>
      <div className="announcement">
        <p>Complimentary domestic shipping on orders over $250</p>
      </div>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="We plus Make home">
          We<span>+</span>Make
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map(([label, href]) => (
            <a key={label} href={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <a className="search-link" href="#shop" aria-label="Search products">
            <Search />
          </a>
          <Button
            variant="ghost"
            className="bag-button"
            onClick={() => setBagOpen(true)}
            aria-label={`Open shopping bag with ${bagCount} items`}
          >
            Bag <span>{bagCount.toString().padStart(2, '0')}</span>
          </Button>
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open menu"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="menu-sheet">
              <SheetHeader>
                <SheetTitle className="wordmark">
                  We<span>+</span>Make
                </SheetTitle>
                <SheetDescription>
                  Objects for considered living.
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile navigation">
                {navItems.map(([label, href]) => (
                  <a key={label} href={href}>
                    {label}
                    <ArrowRight />
                  </a>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <img
          className="hero-image"
          src={EDITORIAL_IMAGE}
          alt="A We+Make collection of sculptural decor in wood, glass, resin, and mosaic"
        />
        <div className="hero-wash" />
        <div className="hero-copy">
          <p className="eyebrow">Edition 01 · New forms</p>
          <h1 id="hero-title">
            Objects with
            <br />a point of view.
          </h1>
          <p className="hero-intro">
            Sculptural decor shaped by digital craft and finished by hand—made
            to hold space, light, and attention.
          </p>
          <a className="primary-link" href="#shop">
            Explore the collection <ArrowRight />
          </a>
        </div>
        <a
          className="scroll-cue"
          href="#collections"
          aria-label="Scroll to collections"
        >
          <ArrowDown />
          <span>Discover</span>
        </a>
      </section>

      <section
        className="manifesto section-shell"
        aria-labelledby="manifesto-title"
      >
        <p className="section-index">01 / Our point of view</p>
        <div>
          <h2 id="manifesto-title">
            Made at the meeting point of <em>technology</em> and touch.
          </h2>
          <p>
            We+Make is a small-batch design studio exploring what everyday
            objects can become. Each piece begins with a precise digital form,
            then gains its character through material, hand finishing, and the
            small variations that make it singular.
          </p>
        </div>
      </section>

      <section
        id="collections"
        className="collections"
        aria-labelledby="collections-title"
      >
        <div className="section-heading section-shell">
          <div>
            <p className="eyebrow">Shop by collection</p>
            <h2 id="collections-title">Curated for every surface.</h2>
          </div>
          <a href="#shop">
            View all objects <ArrowRight />
          </a>
        </div>
        <div className="collection-grid section-shell">
          {[
            ['Planters', 'Sculptural homes for living forms', products[0]],
            [
              'Table objects',
              'Useful pieces with jewel-like depth',
              products[1],
            ],
            ['Desk objects', 'Functional forms for considered workspaces', products[3]],
          ].map(([name, description, product], index) => {
            const typedProduct = product as Product;
            return (
              <button
                key={name as string}
                className={`collection-card collection-card-${index + 1}`}
                onClick={() => {
                  setFilter(name as string);
                  document
                    .querySelector('#shop')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <ProductImage product={typedProduct} />
                <span className="collection-number">0{index + 1}</span>
                <span className="collection-info">
                  <strong>{name as string}</strong>
                  <small>{description as string}</small>
                </span>
                <span className="round-arrow">
                  <ArrowRight />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        id="shop"
        className="shop section-shell"
        aria-labelledby="shop-title"
      >
        <div className="shop-heading">
          <div>
            <p className="eyebrow">The collection</p>
            <h2 id="shop-title">Objects of permanence.</h2>
          </div>
          <p>
            Small-batch pieces created with an exacting eye and an experimental
            hand.
          </p>
        </div>

        <div className="shop-tools">
          <div className="filter-list" aria-label="Filter products by category">
            {categories.map((category) => (
              <button
                key={category}
                className={filter === category ? 'active' : ''}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search />
            <span className="sr-only">Search the collection</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search materials or objects"
            />
          </label>
        </div>

        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <article key={product.id} className="product-card">
                <button
                  className="product-visual"
                  onClick={() => setSelected(product)}
                  aria-label={`View ${product.name}`}
                >
                  <ProductImage product={product} />
                  <span className="quick-view">Quick view</span>
                </button>
                <div className="product-meta">
                  <div>
                    <p>
                      {product.category} · {product.material}
                    </p>
                    <h3>{product.name}</h3>
                  </div>
                  <span>${product.price}</span>
                </div>
                <Button variant="outline" onClick={() => addToBag(product)}>
                  Add to bag <Plus />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-products">
            <p>No objects match that search.</p>
            <button
              onClick={() => {
                setQuery('');
                setFilter('All objects');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <section id="studio" className="studio-story">
        <div className="studio-image">
          <img
            src={EDITORIAL_IMAGE}
            alt="Material details from the We+Make studio"
          />
        </div>
        <div className="studio-copy">
          <p className="section-index">02 / From the studio</p>
          <h2>
            Designed in layers.
            <br />
            <em>Finished by hand.</em>
          </h2>
          <p>
            Digital fabrication gives us extraordinary control over proportion
            and rhythm. The hand brings warmth: sanding, casting, assembling,
            and inlaying each object until it feels resolved.
          </p>
          <a className="text-link" href="#materials">
            Step inside the process <ArrowRight />
          </a>
        </div>
      </section>

      <section
        id="materials"
        className="materials section-shell"
        aria-labelledby="materials-title"
      >
        <div className="materials-intro">
          <p className="eyebrow">Our material library</p>
          <h2 id="materials-title">
            Texture tells
            <br />
            the story.
          </h2>
        </div>
        <div className="material-list">
          {[
            [
              '01',
              'Wood + polymer',
              'Warm wood-filled filament reveals the quiet topography of every printed layer.',
            ],
            [
              '02',
              'Resin + glass',
              'Cast, polished, and translucent—made to bend light and deepen color.',
            ],
            [
              '03',
              'Mosaic + metal',
              'Glass and stone set by hand, punctuated with restrained brass inlay.',
            ],
          ].map(([number, name, description]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{name}</h3>
              <p>{description}</p>
              <ChevronDown />
            </article>
          ))}
        </div>
      </section>

      <section className="services" aria-label="Customer service highlights">
        <div>
          <span>01</span>
          <p>
            <strong>Made in small batches</strong>Carefully produced, never mass
            made.
          </p>
        </div>
        <div>
          <span>02</span>
          <p>
            <strong>Complimentary shipping</strong>On domestic orders over $250.
          </p>
        </div>
        <div>
          <span>03</span>
          <p>
            <strong>Considered packaging</strong>Plastic-light and ready to
            gift.
          </p>
        </div>
      </section>

      <footer>
        <div className="footer-main section-shell">
          <div className="newsletter">
            <p className="eyebrow">Notes from the studio</p>
            <h2>
              New forms,
              <br />
              occasionally.
            </h2>
            {joined ? (
              <p className="success-message">
                <Check /> You’re on the list. Thank you.
              </p>
            ) : (
              <form onSubmit={submitNewsletter}>
                <label>
                  <span className="sr-only">Email address</span>
                  <Input type="email" required placeholder="Email address" />
                </label>
                <Button type="submit" aria-label="Join the We+Make newsletter">
                  <ArrowRight />
                </Button>
              </form>
            )}
          </div>
          <div className="footer-links">
            <div>
              <p>Explore</p>
              <a href="#shop">Shop all</a>
              <a href="#collections">Collections</a>
              <a href="#studio">Our studio</a>
            </div>
            <div>
              <p>Assistance</p>
              <a href="#footer">Shipping + returns</a>
              <a href="#footer">Care guide</a>
              <a href="mailto:hello@wemake.studio">Contact</a>
            </div>
            <div>
              <p>Follow</p>
              <a href="#footer">Instagram</a>
              <a href="#footer">Pinterest</a>
              <a href="#footer">Journal</a>
            </div>
          </div>
        </div>
        <div id="footer" className="footer-bottom section-shell">
          <a className="wordmark" href="#top">
            We<span>+</span>Make
          </a>
          <p>Objects for considered living.</p>
          <div>
            <span>© 2026 We+Make</span>
            <a href="#footer">Privacy</a>
            <a href="#footer">Terms</a>
          </div>
        </div>
      </footer>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="product-dialog">
          {selected && (
            <>
              <ProductImage product={selected} />
              <div className="dialog-copy">
                <DialogHeader>
                  <p className="eyebrow">
                    {selected.category} · {selected.material}
                  </p>
                  <DialogTitle>{selected.name}</DialogTitle>
                  <DialogDescription>{selected.note}</DialogDescription>
                </DialogHeader>
                <p className="dialog-price">${selected.price}</p>
                <div className="finish-row">
                  <span>Finish</span>
                  <button
                    className="swatch active"
                    aria-label="Natural finish"
                  />
                  <button
                    className="swatch turquoise"
                    aria-label="Turquoise finish"
                  />
                </div>
                <Button className="dialog-add" onClick={() => addToBag(selected)}>
                  Add to bag <ArrowRight />
                </Button>
                <div className="detail-notes">
                  <p>Made to order in 2–3 weeks.</p>
                  <p>Material variation makes every piece unique.</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="right" className="bag-sheet">
          <SheetHeader>
            <SheetTitle>
              Your bag <span>{bagCount.toString().padStart(2, '0')}</span>
            </SheetTitle>
            <SheetDescription>Objects chosen for your space.</SheetDescription>
          </SheetHeader>
          {bagItems.length ? (
            <>
              <div className="bag-items">
                {bagItems.map((product) => (
                  <article key={product.id}>
                    <ProductImage product={product} />
                    <div>
                      <p>{product.name}</p>
                      <span>${product.price}</span>
                      <div className="quantity">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          aria-label={`Remove one ${product.name}`}
                        >
                          <Minus />
                        </button>
                        <span>{cart[product.id]}</span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          aria-label={`Add one ${product.name}`}
                        >
                          <Plus />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="bag-footer">
                <div>
                  <span>Subtotal</span>
                  <strong>${subtotal}</strong>
                </div>
                <p>Shipping and taxes calculated at checkout.</p>
                <Button onClick={checkout} disabled={checkingOut}>
                  {checkingOut ? 'Preparing checkout…' : 'Secure Shopify checkout'}{' '}
                  <ArrowRight />
                </Button>
              </div>
            </>
          ) : (
            <div className="empty-bag">
              <ShoppingBag />
              <h3>Your bag is waiting.</h3>
              <p>
                Discover objects designed to bring texture and intention to the
                everyday.
              </p>
              <Button onClick={() => setBagOpen(false)}>
                Explore the collection
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
