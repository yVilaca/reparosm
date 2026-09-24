import MyShopRoute from '@/components/my-shop-route';
import { shops } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function MyShopPage() {
  const account = await requireServerAccount();
  const [shop] = await shops.list(account.id);
  return <MyShopRoute initialShop={shop ? { id: shop.id, ...shop.data } : undefined} />;
}
