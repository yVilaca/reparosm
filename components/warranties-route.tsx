import Link from 'next/link';
import type { Order } from '@/lib/types';

type OrderRow = Order & { id: string };

export default function WarrantiesRoute({ orders }: { orders: OrderRow[] }) {
  const covered = orders
    .filter((order) => order.stage === 'Retirada' || order.status === 'Concluído')
    .map((order) => ({ ...order, days: Number(order.warrantyDays || 90) }));
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Garantias</h1>
          <small>Ordens entregues e retornos acompanhados no servidor.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <div className="metrics">
        <Metric title="Garantias ativas" value={String(covered.length)} detail="Ordens entregues" />
        <Metric
          title="Vencem em breve"
          value={String(covered.filter((order) => order.days <= 15).length)}
          detail="Até 15 dias"
        />
        <Metric
          title="Retornos"
          value={String(orders.filter((order) => order.priority === 'Garantia').length)}
          detail="Em atendimento"
        />
        <Metric title="Prazo padrão" value="90 dias" detail="Configurável na assistência" />
      </div>
      {covered.length ? (
        <article className="panel page-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Aparelho</th>
                  <th>Serviço</th>
                  <th>Prazo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {covered.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.code}</b>
                    </td>
                    <td>{order.customer}</td>
                    <td>{order.device}</td>
                    <td>{order.problem}</td>
                    <td>{order.days} dias</td>
                    <td>
                      <span className="badge">Ativa</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>Nenhuma garantia ativa</h2>
          <p>Ao entregar uma ordem, a garantia aparecerá automaticamente aqui.</p>
        </article>
      )}
    </>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
