import Link from 'next/link';
import OrdersTable from '@/components/orders-table';
import { orders } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function OrdersPage() {
  const account = await requireServerAccount();
  const records = await orders.list(account.id);
  const rows = records.map((record) => ({ id: record.id, ...record.data }));
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Ordens de serviço</h1>
          <small>Dados carregados no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
        </div>
      </header>
      <OrdersTable orders={rows} />
    </>
  );
}
