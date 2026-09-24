import type { Client, Expense, Message, Order, Part, Payment, Quote } from '@/lib/types';
import { formatMoney } from '@/lib/format';

type Row<T> = T & { id: string };
type Activity = {
  id: string;
  activity: string;
  label: string;
  value?: number;
  when?: string;
};

export default function DashboardRoute({
  orders,
  quotes,
  parts,
  clients,
  payments,
  expenses,
  messages,
}: {
  orders: Row<Order>[];
  quotes: Row<Quote>[];
  parts: Row<Part>[];
  clients: Row<Client>[];
  payments: Row<Payment>[];
  expenses: Row<Expense>[];
  messages: Row<Message>[];
}) {
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.value || 0), 0);
  const out = expenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);
  const profit = revenue - out;
  const goal = 50000;
  const open = orders.filter((order) => order.status !== 'Concluído' && order.stage !== 'Retirada');
  const low = parts.filter((part) => Number(part.stock) < 5);
  const approved = quotes.filter((quote) => quote.status === 'Aprovado');
  const activity: Activity[] = [
    ...payments.map((payment) => ({
      id: payment.id,
      activity: 'Recebimento',
      label: payment.description,
      value: Number(payment.value),
      when: payment.createdAt || payment.date,
    })),
    ...expenses.map((expense) => ({
      id: expense.id,
      activity: 'Despesa',
      label: expense.description,
      value: -Number(expense.value),
      when: expense.createdAt || expense.date,
    })),
    ...orders.map((order) => ({
      id: order.id,
      activity: 'Ordem',
      label: `${order.code} · ${order.customer || 'Cliente não informado'}`,
      when: order.createdAt,
    })),
    ...messages.map((message) => ({
      id: message.id,
      activity: 'WhatsApp',
      label: `${message.customer} · ${message.kind}`,
      when: message.sentAt,
    })),
  ]
    .sort((left, right) => String(right.when || '').localeCompare(String(left.when || '')))
    .slice(0, 8);
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Dashboard</h1>
          <small>Visão geral da sua assistência.</small>
        </div>
      </header>
      <article className="monthly-goal">
        <div>
          <span>META MENSAL DE RECEITA</span>
          <h3>
            {formatMoney(revenue)} <small>de {formatMoney(goal)}</small>
          </h3>
          <p>
            {revenue
              ? `Faltam ${formatMoney(Math.max(0, goal - revenue))} para a meta.`
              : 'Registre seu primeiro recebimento para iniciar a meta.'}
          </p>
        </div>
        <div className="goal-visual">
          <strong>{Math.min(100, Math.round((revenue / goal) * 100))}%</strong>
          <div>
            <i style={{ width: `${Math.min(100, (revenue / goal) * 100)}%` }} />
          </div>
          <small>Baseado nos recebimentos registrados</small>
        </div>
      </article>
      <div className="metrics">
        <Metric
          title="Receita recebida"
          value={formatMoney(revenue)}
          detail={`${payments.length} recebimentos`}
        />
        <Metric
          title="Despesas"
          value={formatMoney(out)}
          detail={`${expenses.length} lançamentos`}
        />
        <Metric
          title="Resultado do caixa"
          value={formatMoney(profit)}
          detail="Receita menos despesas"
        />
        <Metric title="Ordens abertas" value={String(open.length)} detail="Em atendimento" />
      </div>
      <div className="dashboard-overview">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Visão geral da loja</h3>
              <p>Tudo que precisa da sua atenção agora.</p>
            </div>
          </div>
          <div className="overview-grid">
            <div>
              <b>{clients.length}</b>
              <span>clientes</span>
            </div>
            <div>
              <b>{approved.length}</b>
              <span>orçamentos aprovados</span>
            </div>
            <div>
              <b>{low.length}</b>
              <span>itens com estoque baixo</span>
            </div>
            <div>
              <b>{orders.filter((order) => order.stage === 'Retirada').length}</b>
              <span>aguardando retirada</span>
            </div>
            <div>
              <b>{parts.reduce((sum, part) => sum + Number(part.stock || 0), 0)}</b>
              <span>unidades em estoque</span>
            </div>
            <div>
              <b>{messages.length}</b>
              <span>mensagens registradas</span>
            </div>
          </div>
        </section>
        <section className="panel activity-card">
          <div className="panel-head">
            <div>
              <h3>Atividades recentes</h3>
              <p>Últimas movimentações do sistema.</p>
            </div>
          </div>
          {activity.length ? (
            <div className="activity-list">
              {activity.map((item, index) => (
                <article key={`${item.activity}-${item.id || index}`}>
                  <i>
                    {item.activity === 'Recebimento'
                      ? '↗'
                      : item.activity === 'Despesa'
                        ? '↘'
                        : item.activity === 'WhatsApp'
                          ? '✉'
                          : '⚒'}
                  </i>
                  <div>
                    <b>{item.label}</b>
                    <span>
                      {item.activity} ·{' '}
                      {item.when ? new Date(item.when).toLocaleDateString('pt-BR') : 'agora'}
                    </span>
                  </div>
                  {typeof item.value === 'number' && (
                    <strong className={item.value < 0 ? 'negative-money' : 'positive-money'}>
                      {item.value < 0 ? '- ' : '+ '}
                      {formatMoney(Math.abs(item.value))}
                    </strong>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-activity">As movimentações aparecerão aqui.</p>
          )}
        </section>
      </div>
      {!orders.length && !payments.length && !expenses.length && (
        <article className="empty-state">
          <div>✦</div>
          <h2>Seu sistema está zerado</h2>
          <p>Crie uma ordem ou registre uma movimentação para começar.</p>
        </article>
      )}
    </>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article>
      <div className="metric-head">
        <span>{title}</span>
        <i className="blue">↗</i>
      </div>
      <h2>{value}</h2>
      <p>{detail}</p>
    </article>
  );
}
