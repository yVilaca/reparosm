import { redirect } from 'next/navigation';
import OrdersScreen, { type OrdersSearchParams } from '@/components/orders-screen';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  const params = await searchParams;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  if (requestedView === 'kanban') {
    const query = new URLSearchParams();
    for (const key of ['busca', 'nova'] as const) {
      const value = Array.isArray(params[key]) ? params[key][0] : params[key];
      if (value) query.set(key, value);
    }
    redirect(`/mesa${query.size ? `?${query}` : ''}`);
  }
  return <OrdersScreen view="grid" searchParams={searchParams} />;
}
