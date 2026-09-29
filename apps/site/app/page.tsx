import { getCatalog } from '@/lib/catalog';
import Storefront from './storefront';

export const revalidate = 60;

export default async function Home() {
  const catalog = await getCatalog();
  return <Storefront products={catalog.products} freeShippingOver={catalog.freeShippingOver} />;
}
