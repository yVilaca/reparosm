import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReceiveAction, WhatsappAction } from '@/components/dashboard-actions';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/page-header';
import { formatMoney, hasValidWhatsapp } from '@/lib/format';
import type { CashHistoryRow, CashTotals, MethodTotal } from '@/lib/repos/cash';
import type { BenchStage, DashboardAction } from '@/lib/repos/dashboard';

type Tone = 'late' | 'waiting' | 'neutral';

const toneDot: Record<Tone, string> = {
  late: 'bg-destructive',
  waiting: 'bg-amber-500',
  neutral: 'bg-muted-foreground/40',
};
const toneText: Record<Tone, string> = {
  late: 'text-destructive',
  waiting: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-muted-foreground',
};

const ago = (days: number) => (days <= 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function describe(action: DashboardAction): { reason: string; tone: Tone } {
  const amount = formatMoney(action.amount ?? 0);
  switch (action.kind) {
    case 'ready':
      return {
        reason: action.days <= 0 ? 'Ficou pronto hoje' : `Pronto para retirada ${ago(action.days)}`,
        tone: action.days >= 1 ? 'waiting' : 'neutral',
      };
    case 'charge':
      return {
        reason: `Concluída, falta receber ${amount}`,
        tone: action.days >= 1 ? 'waiting' : 'neutral',
      };
    case 'stalled':
      return { reason: `Urgente, sem andamento ${ago(action.days)}`, tone: 'waiting' };
    case 'quote':
      return { reason: `Orçamento de ${amount} sem resposta ${ago(action.days)}`, tone: 'waiting' };
    case 'overdue':
      return { reason: `Vencida ${ago(action.days)}, ${amount}`, tone: 'late' };
    case 'restock':
      return { reason: 'Sem unidades em estoque', tone: 'neutral' };
  }
}

function ActionButton({ action }: { action: DashboardAction }) {
  const openOrder = (
    <Button asChild size="sm" variant="outline">
      <Link href={`/ordens?busca=${encodeURIComponent(action.code || action.who)}`}>Abrir OS</Link>
    </Button>
  );
  const canMessage = Boolean(action.phone && hasValidWhatsapp(action.phone));
  switch (action.kind) {
    case 'ready':
      return canMessage ? (
        <WhatsappAction
          customer={action.who}
          kind="Atualização da OS"
          label="Avisar"
          message={`Olá, ${firstName(action.who)}! Seu ${action.what || 'aparelho'} (${action.code}) está pronto para retirada.`}
          orderId={action.id}
          phone={action.phone!}
        />
      ) : (
        openOrder
      );
    case 'charge':
      return (
        <ReceiveAction
          order={{ id: action.id, code: action.code || '', total: action.amount ?? 0 }}
        />
      );
    case 'stalled':
      return openOrder;
    case 'quote':
      return canMessage ? (
        <WhatsappAction
          customer={action.who}
          kind="Orçamento"
          label="Cobrar resposta"
          message={`Olá, ${firstName(action.who)}! Você conseguiu ver o orçamento ${action.code} do seu ${action.what || 'aparelho'}? Se tiver alguma dúvida, é só responder por aqui.`}
          phone={action.phone!}
        />
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href="/orcamentos">Abrir orçamento</Link>
        </Button>
      );
    case 'overdue':
      return (
        <Button asChild size="sm" variant="outline">
          <Link href={`/contas-pagar?pagar=${encodeURIComponent(action.id)}`}>Pagar</Link>
        </Button>
      );
    case 'restock':
      return (
        <Button asChild size="sm" variant="outline">
          <Link href="/estoque?view=inventory">Repor</Link>
        </Button>
      );
  }
}

const dateFormat = (options: Intl.DateTimeFormatOptions) => (isoDate: string) =>
  new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
const longDate = dateFormat({ weekday: 'long', day: 'numeric', month: 'long' });
const monthName = dateFormat({ month: 'long' });
const previousMonthOf = (isoDate: string) => {
  const date = new Date(`${isoDate.slice(0, 7)}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
};
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function monthComparison(current: number, previous: number, previousMonth: string) {
  if (previous === 0) return `Sem recebimentos no mesmo período de ${previousMonth}.`;
  const delta = current - previous;
  const sign = delta >= 0 ? '+' : '−';
  const percent = Math.round((Math.abs(delta) / previous) * 100);
  return `${sign}${formatMoney(Math.abs(delta))} (${sign}${percent}%) em relação ao mesmo período de ${previousMonth}.`;
}

export default function DashboardRoute({
  asOfDate,
  actions,
  bench,
  today,
  movements,
  month,
}: {
  asOfDate: string;
  actions: DashboardAction[];
  bench: BenchStage[];
  today: CashTotals & { methods: MethodTotal[] };
  movements: CashHistoryRow[];
  month: { current: CashTotals; previous: CashTotals };
}) {
  const inService = bench.reduce((sum, item) => sum + item.orders, 0);

  return (
    <>
      <PageHeader
        title="Hoje"
        description={capitalize(longDate(asOfDate))}
        action={
          <Button asChild className="w-full sm:w-auto">
            <Link href="/ordens?nova=1">
              <Plus aria-hidden="true" />
              Nova OS
            </Link>
          </Button>
        }
      />

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <aside
          aria-labelledby="cash-title"
          className="rounded-xl border bg-card p-4 lg:col-start-2 lg:row-start-1 lg:self-start"
        >
          <h2 className="text-base font-semibold" id="cash-title">
            Caixa de hoje
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 lg:grid-cols-1 lg:gap-2">
            <div className="lg:flex lg:items-baseline lg:justify-between">
              <dt className="text-sm text-muted-foreground">Entrou</dt>
              <dd className="font-medium tabular-nums">{formatMoney(today.income)}</dd>
            </div>
            <div className="lg:flex lg:items-baseline lg:justify-between">
              <dt className="text-sm text-muted-foreground">Saiu</dt>
              <dd className="font-medium tabular-nums">{formatMoney(today.expense)}</dd>
            </div>
            <div className="lg:flex lg:items-baseline lg:justify-between lg:border-t lg:pt-2">
              <dt className="text-sm text-muted-foreground">Saldo</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatMoney(today.balance)}</dd>
            </div>
          </dl>

          {today.methods.length > 0 && (
            <ul
              aria-label="Entradas por forma de pagamento"
              className="mt-3 hidden text-sm sm:block"
            >
              {today.methods.map((item) => (
                <li className="flex justify-between gap-3 py-0.5" key={item.method}>
                  <span className="text-muted-foreground">{item.method}</span>
                  <span className="tabular-nums">{formatMoney(item.value)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              {capitalize(monthName(asOfDate))} até hoje
            </p>
            <p className="font-semibold tabular-nums">{formatMoney(month.current.income)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {monthComparison(
                month.current.income,
                month.previous.income,
                monthName(previousMonthOf(asOfDate)),
              )}
            </p>
          </div>

          {movements.length > 0 && (
            <div className="mt-4 hidden border-t pt-3 sm:block">
              <h3 className="text-sm text-muted-foreground">Movimentos de hoje</h3>
              <ul className="mt-1 text-sm">
                {movements.slice(0, 6).map((row) => (
                  <li className="flex justify-between gap-3 py-0.5" key={row.id}>
                    <span className="min-w-0 truncate">
                      {row.order ? `Recebimento ${row.order.code}` : row.description}
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${row.kind === 'out' ? 'text-muted-foreground' : ''}`}
                    >
                      {row.kind === 'out' ? '−' : '+'}
                      {formatMoney(row.value)}
                    </span>
                  </li>
                ))}
              </ul>
              {movements.length > 6 && (
                <Link className="mt-1 inline-block text-xs underline" href="/pagamentos">
                  Ver os {movements.length} movimentos
                </Link>
              )}
            </div>
          )}
        </aside>

        <section aria-labelledby="todo-title" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="flex items-baseline justify-between gap-3 border-b pb-2">
            <h2 className="text-base font-semibold" id="todo-title">
              Para fazer agora
            </h2>
            {actions.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {actions.length} {actions.length === 1 ? 'pendência' : 'pendências'}
              </span>
            )}
          </div>

          {actions.length ? (
            <ol className="divide-y">
              {actions.map((action) => {
                const { reason, tone } = describe(action);
                return (
                  <li className="flex items-start gap-3 py-3" key={`${action.kind}-${action.id}`}>
                    <span
                      aria-hidden="true"
                      className={`mt-2 size-2 shrink-0 rounded-full ${toneDot[tone]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{action.who}</span>
                        {action.what && action.what !== action.who && (
                          <span className="text-sm text-muted-foreground">{action.what}</span>
                        )}
                        {action.code && (
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {action.code}
                          </span>
                        )}
                      </p>
                      <p className={`text-sm ${toneText[tone]}`}>{reason}</p>
                    </div>
                    <div className="shrink-0">
                      <ActionButton action={action} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="py-10 text-center">
              <p className="font-medium">Tudo em dia</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhum aparelho esperando aviso, nenhuma cobrança ou conta atrasada.
              </p>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="bench-title" className="mt-8 border-t pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold" id="bench-title">
            Na bancada
          </h2>
          <Link className="text-sm underline-offset-4 hover:underline" href="/ordens?view=kanban">
            Abrir Kanban
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {inService === 1 ? '1 aparelho em serviço' : `${inService} aparelhos em serviço`}
        </p>
        <ol className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {bench.map((item) => (
            <li key={item.stage}>
              <span
                className={`block text-xl font-semibold tabular-nums ${item.orders ? '' : 'text-muted-foreground/60'}`}
              >
                {item.orders}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">{item.stage}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
