import type { products } from "@/db/schema";
import { centsToInput } from "@/lib/money";

type Product = typeof products.$inferSelect;

export const CATEGORIES = ["Planters", "Table objects", "Vases", "Desk objects", "Kitchen decor"];

/** The product fields, shared by Add and Edit. */
export function ProductFields({ product }: { product?: Product }) {
  const categories = product && !CATEGORIES.includes(product.category) ? [...CATEGORIES, product.category] : CATEGORIES;
  return (
    <>
      <div className="wm-fields">
        <label className="wm-field">Name<input name="name" required defaultValue={product?.name} placeholder="Arcadia Tall Planter" /></label>
        <label className="wm-field">Category
          <select name="category" defaultValue={product?.category ?? CATEGORIES[0]}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
        </label>
        <label className="wm-field">Price (USD)<input name="price" required inputMode="decimal" defaultValue={product ? centsToInput(product.priceCents) : ""} placeholder="118" /></label>
        <label className="wm-field">Status
          <select name="status" defaultValue={product?.status ?? "draft"}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (on the storefront)</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <label className="wm-field">Material line<input name="material" defaultValue={product?.material} placeholder="Wood composite · Resin" /></label>
      <label className="wm-field">Description<textarea name="note" defaultValue={product?.note} placeholder="One or two sentences for the product card and quick view." /></label>
      <div className="wm-fields">
        <label className="wm-field">Image<input name="image" defaultValue={product?.image} placeholder="/products/we-make-material-edition/…png" /><small>A path on the storefront, or an https:// link.</small></label>
        <label className="wm-field">Handle<input name="handle" defaultValue={product?.handle} placeholder="made from the name" /><small>The product&apos;s id on the site and in Stripe.</small></label>
        <label className="wm-field">Sort order<input name="sortOrder" inputMode="numeric" defaultValue={product?.sortOrder ?? 0} /></label>
      </div>
      <div className="wm-fields">
        <label className="wm-field">Print hours per piece<input name="printHours" inputMode="decimal" defaultValue={product?.printHours ?? "0"} /></label>
        <label className="wm-field">Finishing minutes per piece<input name="laborMinutes" inputMode="numeric" defaultValue={product?.laborMinutes ?? 0} /><small>Casting, sanding, inlay, packing.</small></label>
        <label className="wm-field">Edition size<input name="editionSize" inputMode="numeric" defaultValue={product?.editionSize ?? ""} placeholder="blank = open" /></label>
      </div>
      <label className="wm-check"><input type="checkbox" name="madeToOrder" defaultChecked={product?.madeToOrder ?? true} /><span><strong>Made to order</strong><br /><span className="wm-muted wm-small">Keep selling when the shelf is empty; production makes the rest.</span></span></label>
      <label className="wm-field">Lead time shown on the site<input name="leadTime" defaultValue={product?.leadTime ?? "Made to order in 2–3 weeks."} /></label>
    </>
  );
}
