import Link from "next/link";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { marginOf } from "@/lib/costing";
import { formatCents } from "@/lib/money";
import { productsWithStock } from "@/lib/products";
import { getSettings } from "@/lib/settings";
import { absoluteImage } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="products">
      {async ({ db }) => {
        const rows = await productsWithStock(db, await getSettings(db));
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Catalog" title="Products" intro="Everything here with the status Active appears on the storefront, at these prices, within a minute of saving.">
              <Link className="wm-button" href="/products/new">Add product</Link>
            </PageHead>
            <section className="wm-card wm-card-flush">
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead><tr><th /><th>Product</th><th>Status</th><th className="num">Price</th><th className="num">Cost</th><th className="num">Margin</th><th className="num">On shelf</th><th className="num">Held</th></tr></thead>
                  <tbody>
                    {rows.map((product) => {
                      const margin = marginOf(product.priceCents, product.cost.totalCents);
                      return (
                        <tr key={product.id}>
                          <td style={{ width: 60 }}>{product.image ? <img className="wm-thumb" src={absoluteImage(product.image)} alt="" /> : <span className="wm-thumb" />}</td>
                          <td><Link href={`/products/${product.id}`}>{product.name}</Link><div className="wm-muted wm-small">{product.category} · {product.madeToOrder ? "made to order" : "from stock only"}</div></td>
                          <td><StatusBadge status={product.status} /></td>
                          <td className="num">{formatCents(product.priceCents)}</td>
                          <td className="num">{product.cost.totalCents ? formatCents(product.cost.totalCents) : <span className="wm-muted">—</span>}</td>
                          <td className="num">{product.cost.totalCents && margin !== null ? `${Math.round(margin * 100)}%` : <span className="wm-muted">—</span>}</td>
                          <td className="num">{product.onHand}</td>
                          <td className="num">{product.reserved || <span className="wm-muted">0</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 ? <p className="wm-empty">No products yet. Add the first one, or run the launch-product seed.</p> : null}
              </div>
            </section>
          </>
        );
      }}
    </OwnerPage>
  );
}
