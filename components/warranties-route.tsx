import Link from 'next/link';
import type { Order } from '@/lib/types';
import { todayInSaoPaulo, warrantyPeriod } from '@/lib/warranty';

type OrderRow = Order & { id: string };

export default function WarrantiesRoute({
  orders,
  defaultWarrantyDays,
}: {
  orders: OrderRow[];
  defaultWarrantyDays: number;
}) {
  const today = todayInSaoPaulo();
  const covered = orders
    .filter(
      (order) =>
        order.stage === 'Retirada' || order.status === 'Concluído' || Boolean(order.deliveredAt),
    )
    .map((order) => ({
      ...order,
      period: warrantyPeriod(order.deliveredAt, order.warrantyDays, today),
    }));
  const active = covered.filter(
    (order) => order.period.status === 'active' || order.period.status === 'expiring',
  ).length;
  const expiring = covered.filter((order) => order.period.status === 'expiring').length;
  // Orders delivered before deliveredAt started being recorded have no valid date to
  // compute a warranty from; surfacing them separately explains why they are not
  // counted as active instead of silently under-reporting "Garantias ativas".
  const unknown = covered.filter((order) => order.period.status === 'unknown').length;

  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Garantias</h1>
          <small>
            Prazo por OS: <Link href="/ordens">Editar ordem</Link>. Padrão da loja:{' '}
            <Link href="/minha-assistencia">Minha assistência</Link>.
          </small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <div className="metrics">
        <Metric title="Garantias ativas" value={String(active)} detail="Dentro do prazo" />
        <Metric title="Vencem em breve" value={String(expiring)} detail="Até 15 dias" />
        <Metric
          title="Garantia desconhecida"
          value={String(unknown)}
          detail="Sem data de entrega registrada"
        />
        <Metric
          title="Retornos"
          value={String(orders.filter((order) => order.priority === 'Garantia').length)}
          detail="Em atendimento"
        />
        <Metric
          title="Prazo padrão"
          value={`${defaultWarrantyDays} dias`}
          detail="Novas ordens desta loja"
        />
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
                  <th>Entrega</th>
                  <th>Prazo</th>
                  <th>Vencimento</th>
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
                    <td>{order.problem || order.service || '—'}</td>
                    <td>{dateLabel(order.deliveredAt)}</td>
                    <td>{order.warrantyDays ? `${order.warrantyDays} dias` : 'Pendente'}</td>
                    <td>{dateLabel(order.period.expiresAt)}</td>
                    <td>
                      <span className="badge">
                        {statusLabel(order.period.status, order.deliveredAt)}
                      </span>
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
          <h2>Nenhuma ordem entregue</h2>
          <p>Ao marcar a OS como retirada, o prazo de garantia aparecerá aqui.</p>
        </article>
      )}
    </>
  );
}

function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
    : 'Pendente';
}

function statusLabel(status: string, deliveredAt?: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'expiring') return 'Vencendo';
  if (status === 'expired') return 'Vencida';
  return deliveredAt ? 'Prazo pendente' : 'Data pendente';
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
