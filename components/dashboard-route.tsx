import Link from 'next/link';

import {
  ArrowDownLeft,
  ArrowUpRight,
  PackageCheck,
  Plus,
  Receipt,
  Store,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import IconChip from '@/components/ui/icon-chip';

import StatCard from '@/components/ui/stat-card';

import {
  toneDot as statusDot,
  toneText as statusText,
  type Tone as StatusTone,
} from '@/components/ui/tone';

import { orderStageTone } from '@/lib/status-tones';

import { ReceiveAction, WhatsappAction } from '@/components/dashboard-actions';

import { Button } from '@/components/ui/button';

import PageHeader from '@/components/ui/page-header';

import { formatMoney, hasValidWhatsapp } from '@/lib/format';

import type { CashTotals, MethodTotal, MonthlyCashTotals } from '@/lib/repos/cash';

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
          <Link href={`/receber-e-pagar?pagar=${encodeURIComponent(action.id)}`}>Pagar</Link>
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

function PriorityRows({ actions }: { actions: DashboardAction[] }) {
  return (
    <ul className="divide-y">
      {actions.map((action) => {
        const { reason, tone } = describe(action);

        return (
          <li
            key={`${action.kind}-${action.id}`}
            className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3"
          >
            <span
              aria-hidden="true"
              className={`mt-2 size-2 shrink-0 rounded-full ${toneDot[tone]}`}
            />

            <div className="min-w-0 flex-1 basis-40">
              <p className="font-medium">
                {action.what && action.what !== action.who ? action.what : action.who}
              </p>

              <p className="text-xs text-muted-foreground">
                {[action.code, action.what && action.what !== action.who ? action.who : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <p className={`mt-1 text-sm ${toneText[tone]}`}>{reason}</p>
            </div>

            <div className="ml-auto shrink-0">
              <ActionButton action={action} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PrioritySection({
  title,
  description,
  actions,
  icon,
  tone,
  empty,
}: {
  title: string;
  description: string;
  actions: DashboardAction[];
  icon: LucideIcon;
  tone: StatusTone;
  empty: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label={title}>
      <div className="mb-2 flex items-start gap-3">
        <IconChip icon={icon} tone={tone} />

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {actions.length ? (
        <>
          <PriorityRows actions={actions.slice(0, 6)} />

          {actions.length > 6 && (
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium focus-visible:outline-primary">
                Mostrar mais {actions.length - 6} nesta lista
              </summary>

              <PriorityRows actions={actions.slice(6)} />
            </details>
          )}
        </>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function CashTrend({ trend }: { trend: MonthlyCashTotals[] }) {
  const peak = Math.max(1, ...trend.flatMap((item) => [item.income, item.expense]));
  return (
    <section aria-labelledby="trend-title" className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trend-title" className="font-semibold">
            Evolução do caixa
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos seis meses. O mês atual considera os lançamentos até hoje.
          </p>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-500" />
            Entradas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-rose-400" />
            Saídas
          </span>
        </div>
      </div>
      <div
        className="mt-6 grid h-44 grid-cols-6 items-end gap-1 border-b px-1 sm:gap-3"
        aria-hidden="true"
      >
        {trend.map((item) => (
          <div key={item.month} className="flex h-full items-end justify-center gap-1.5">
            <span
              className="w-4 rounded-t bg-emerald-500 sm:w-6"
              style={{ height: `${(item.income / peak) * 100}%` }}
              title={formatMoney(item.income)}
            />
            <span
              className="w-4 rounded-t bg-rose-400/80 sm:w-6"
              style={{ height: `${(item.expense / peak) * 100}%` }}
              title={formatMoney(item.expense)}
            />
          </div>
        ))}
      </div>
      <div
        className="mt-2 grid grid-cols-6 gap-1 text-center text-xs text-muted-foreground sm:gap-3"
        aria-hidden="true"
      >
        {trend.map((item) => (
          <span key={item.month}>{monthName(item.month).slice(0, 3)}</span>
        ))}
      </div>
      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Ver valores por mês</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Entradas, saídas e resultado do caixa nos últimos seis meses
            </caption>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Mês</th>
                <th className="px-2 text-right">Entradas</th>
                <th className="px-2 text-right">Saídas</th>
                <th className="pl-2 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((item) => (
                <tr key={item.month} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    {capitalize(monthName(item.month))} {item.month.slice(0, 4)}
                  </th>
                  <td className="px-2 text-right tabular-nums">{formatMoney(item.income)}</td>
                  <td className="px-2 text-right tabular-nums">{formatMoney(item.expense)}</td>
                  <td className="pl-2 text-right tabular-nums">{formatMoney(item.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function DashboardRoute({
  asOfDate,
  actions,
  bench,
  today,
  month,
  trend,
}: {
  asOfDate: string;
  actions: DashboardAction[];
  bench: BenchStage[];
  today: CashTotals & { methods: MethodTotal[] };
  month: { current: CashTotals; previous: CashTotals };
  trend: MonthlyCashTotals[];
}) {
  const inService = bench.reduce((sum, item) => sum + item.orders, 0);
  const paid = trend.find((item) => item.month === `${asOfDate.slice(0, 7)}-01`);
  const workshop = actions.filter((action) => action.kind === 'stalled' || action.kind === 'quote');
  const pickup = actions.filter((action) => action.kind === 'ready' || action.kind === 'charge');
  const management = actions.filter(
    (action) => action.kind === 'overdue' || action.kind === 'restock',
  );
  return (
    <>
      <PageHeader
        title="Visão da assistência"
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
      <section
        aria-label="Resultados financeiros do mês"
        className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <StatCard
          detail={
            <>
              <p>{capitalize(monthName(asOfDate))} até hoje</p>
              <p>
                {monthComparison(
                  month.current.income,
                  month.previous.income,
                  monthName(previousMonthOf(asOfDate)),
                )}
              </p>
            </>
          }
          icon={ArrowDownLeft}
          label="Recebimentos no mês"
          tone="success"
          value={formatMoney(month.current.income)}
        />
        <StatCard
          detail="Despesas e pagamentos lançados no caixa."
          icon={ArrowUpRight}
          label="Saídas no mês"
          tone="danger"
          value={formatMoney(month.current.expense)}
        />
        <StatCard
          detail="Entradas menos saídas do mês. Não representa lucro contábil."
          icon={Wallet}
          label="Resultado do caixa"
          value={formatMoney(month.current.balance)}
          valueTone={month.current.balance < 0 ? 'danger' : undefined}
        />
        <StatCard
          detail={`${paid?.paidOrders || 0} OS recebidas no mês.`}
          icon={Receipt}
          label="Ticket médio das OS"
          tone="info"
          value={formatMoney(paid?.averageTicket || 0)}
        />
      </section>
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <CashTrend trend={trend} />
        <aside aria-labelledby="cash-title" className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 id="cash-title" className="flex items-center gap-2 font-semibold">
            <IconChip icon={Wallet} size="sm" />
            Caixa de hoje
          </h2>
          <dl className="mt-4 grid gap-3">
            {(
              [
                ['Entrou', today.income, today.income > 0 ? statusText.success : ''],
                ['Saiu', today.expense, ''],
                ['Saldo', today.balance, today.balance < 0 ? statusText.danger : ''],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className={`font-semibold tabular-nums ${color}`}>{formatMoney(value)}</dd>
              </div>
            ))}
          </dl>
          {today.methods.length > 0 && (
            <ul aria-label="Entradas por forma de pagamento" className="mt-4 border-t pt-3 text-xs">
              {today.methods.map((item) => (
                <li key={item.method} className="flex justify-between gap-2 py-1">
                  <span className="text-muted-foreground">{item.method}</span>
                  <span className="tabular-nums">{formatMoney(item.value)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="outline" className="mt-5 w-full">
            <Link href="/pagamentos">Abrir Caixa</Link>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Registre recebimentos e despesas para manter os resultados atualizados.
          </p>
        </aside>
      </div>
      <section aria-labelledby="bench-title" className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="bench-title" className="font-semibold">
              Fluxo dos aparelhos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inService === 1 ? '1 aparelho em serviço' : `${inService} aparelhos em serviço`}
            </p>
          </div>
          <Link
            href="/ordens?view=kanban"
            className="rounded text-sm font-medium text-primary hover:underline focus-visible:outline-primary"
          >
            Abrir quadro
          </Link>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {bench.map((item) => (
            <li key={item.stage}>
              <strong className="block text-xl font-semibold tabular-nums">{item.orders}</strong>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${statusDot[orderStageTone(item.stage)]}`}
                />
                {item.stage}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {!actions.length && (
        <div className="mb-4 rounded-lg border border-dashed px-4 py-3">
          <p className="font-medium">Tudo em dia</p>
          <p className="text-sm text-muted-foreground">
            Sem alertas identificados. Acompanhe as OS pelo fluxo acima.
          </p>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <PrioritySection
          title="Bancada e aprovações"
          description="Urgentes sem andamento e orçamentos esperando resposta."
          actions={workshop}
          icon={Wrench}
          tone="info"
          empty="Nenhuma OS urgente parada nem orçamento sem resposta há dois dias ou mais."
        />
        <PrioritySection
          title="Retiradas e recebimentos"
          description="Avise o cliente e finalize os recebimentos pendentes."
          actions={pickup}
          icon={PackageCheck}
          tone="success"
          empty="Nenhum aparelho para avisar nem OS concluída com recebimento pendente."
        />
        <PrioritySection
          title="Gestão da loja"
          description="Contas vencidas e itens que precisam de reposição."
          actions={management}
          icon={Store}
          tone="warning"
          empty="Nenhuma conta vencida ou item sem estoque."
        />
      </div>
    </>
  );
}
