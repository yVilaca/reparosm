import OrdersScreen, { type OrdersSearchParams } from '@/components/orders-screen';

export default function MesaPage({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
  return <OrdersScreen view="kanban" searchParams={searchParams} />;
}
