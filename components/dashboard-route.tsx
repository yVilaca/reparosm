import Link from 'next/link';
import type { Client, Expense, Message, Order, Part, Payment, Quote } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';

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
  const goal = 50000;
  const progress = Math.max(0, Math.min(100, Math.round((revenue / goal) * 100)));
  const open = orders.filter((order) => order.status !== 'Concluído' && order.stage !== 'Retirada');
  const low = parts.filter((part) => Number(part.stock) < 5);
  const waitingApproval = quotes.filter((quote) => quote.status === 'Aguardando');
  const readyPickup = orders.filter((order) => order.stage === 'Retirada');
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

  const priorities = [
    {
      count: open.length,
      label: 'Ordens em atendimento',
      detail: 'Acompanhar na Mesa',
      href: '/mesa',
      variant: 'default',
    },
    {
      count: waitingApproval.length,
      label: 'Orçamentos aguardando aprovação',
      detail: 'Ver orçamentos',
      href: '/orcamentos',
      variant: 'warning',
    },
    {
      count: readyPickup.length,
      label: 'Ordens aguardando retirada',
      detail: 'Conferir na Mesa',
      href: '/mesa',
      variant: 'success',
    },
    {
      count: low.length,
      label: 'Itens com estoque baixo',
      detail: 'Repor estoque',
      href: '/estoque?view=inventory',
      variant: 'destructive',
    },
  ] as const;
  const activePriorities = priorities.filter((item) => item.count > 0);

  const overview = [
    { label: 'Clientes', value: clients.length },
    { label: 'Orçamentos aprovados', value: approved.length },
    { label: 'Itens com estoque baixo', value: low.length },
    { label: 'Aguardando retirada', value: readyPickup.length },
    {
      label: 'Unidades em estoque',
      value: parts.reduce((sum, part) => sum + Number(part.stock || 0), 0),
    },
    { label: 'Mensagens registradas', value: messages.length },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Acompanhe as prioridades e a movimentação da sua assistência."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/mesa">Abrir Mesa</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/ordens">Nova ordem</Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Fila de prioridades</CardTitle>
              <CardDescription>O que precisa de uma ação da equipe.</CardDescription>
            </div>
            <Button asChild className="shrink-0" size="sm" variant="ghost">
              <Link href="/mesa">Ver Mesa</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activePriorities.length ? (
              <ul className="grid gap-2">
                {activePriorities.map((item) => (
                  <li key={item.label}>
                    <Link
                      className="group flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      href={item.href}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                      <Badge
                        aria-label={`${item.count} ${item.count === 1 ? 'item' : 'itens'}`}
                        className="h-8 min-w-8 justify-center rounded-full px-2 text-sm tabular-nums"
                        variant={item.variant}
                      >
                        {item.count}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                action={
                  <Button asChild size="sm">
                    <Link href="/ordens">Criar ordem</Link>
                  </Button>
                }
                description="Ordens, aprovações e estoque estão em dia."
                title="Nenhuma pendência agora"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta mensal de receita</CardTitle>
            <CardDescription>Baseada nos recebimentos registrados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatMoney(revenue)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">de {formatMoney(goal)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {revenue
                    ? `Faltam ${formatMoney(Math.max(0, goal - revenue))} para a meta.`
                    : 'Registre seu primeiro recebimento para iniciar a meta.'}
                </span>
                <span className="font-medium tabular-nums">{progress}%</span>
              </div>
              <div
                aria-label="Meta mensal de receita"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Visão geral da loja</CardTitle>
            <CardDescription>Um resumo dos cadastros e recursos da assistência.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {overview.map((item) => (
                <div className="rounded-lg bg-muted/50 p-3" key={item.label}>
                  <dt className="mt-1 text-xs leading-snug text-muted-foreground">{item.label}</dt>
                  <dd className="mt-2 text-xl font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividades recentes</CardTitle>
            <CardDescription>Últimas movimentações do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length ? (
              <ul className="divide-y">
                {activity.map((item, index) => (
                  <li
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    key={`${item.activity}-${item.id || index}`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm text-muted-foreground"
                    >
                      {item.activity === 'Recebimento'
                        ? '↗'
                        : item.activity === 'Despesa'
                          ? '↘'
                          : item.activity === 'WhatsApp'
                            ? '✉'
                            : '⚒'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.activity} ·{' '}
                        {item.when ? new Date(item.when).toLocaleDateString('pt-BR') : 'agora'}
                      </span>
                    </span>
                    {typeof item.value === 'number' && (
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${item.value < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'}`}
                      >
                        {item.value < 0 ? '- ' : '+ '}
                        {formatMoney(Math.abs(item.value))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                description="As ordens e movimentações aparecerão aqui."
                title="Sem atividade recente"
              />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
