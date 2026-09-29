import Link from "next/link";
import { createProductAction } from "@/app/actions/products";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { ProductFields } from "@/components/products/product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add product" };

export default function NewProductPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="products">
      {() => (
        <>
          <Flash searchParams={searchParams} />
          <PageHead eyebrow="Catalog" title="Add a product" intro="Save it as a draft first if you want to set up materials and cost before it goes live.">
            <Link className="wm-button" data-variant="ghost" href="/products">Cancel</Link>
          </PageHead>
          <form action={createProductAction} className="wm-card wm-form" style={{ maxWidth: 860 }}>
            <ProductFields />
            <div><button className="wm-button" type="submit">Add product</button></div>
          </form>
        </>
      )}
    </OwnerPage>
  );
}
