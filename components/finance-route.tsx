'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import MoneyModal, {
  type MoneyData,
  type MoneyKind,
  type MoneyRow,
  type SaveMoney,
} from '@/components/money-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import IconChip from '@/components/ui/icon-chip';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import RowMenu from '@/components/ui/row-menu';
import Segmented from '@/components/ui/segmented';
import StatCard from '@/components/ui/stat-card';
import { toneText } from '@/components/ui/tone';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/format';
import type { CashHistoryRow, CashPeriod, CashTotals, MethodTotal } from '@/lib/repos/cash';

type FinanceRow = MoneyRow & { order: CashHistoryRow['order'] };

const toFinanceRow = (row: CashHistoryRow): FinanceRow => ({
  ...row,
  kind: row.kind === 'in' ? 'payment' : 'expense',
  reference: row.reference || '',
});

const variation = (current: number, previous: number) => {
  const absolute = current - previous;
  const percent = previous === 0 ? null : (absolute / previous) * 100;
  return { absolute, percent };
};

const periods: Array<{ value: CashPeriod; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: 'month', label: 'Este mês' },
  { value: 'previous-month', label: 'Mês passado' },
];

type FinanceSection = 'overview' | 'entries' | 'analysis';

const sections: Array<{ value: FinanceSection; label: string }> = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'entries', label: 'Lançamentos' },
  { value: 'analysis', label: 'Análise' },
];

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function TotalsGrid({ totals }: { totals: CashTotals }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={ArrowDownLeft}
        label="Entradas"
        tone="success"
        value={formatMoney(totals.income)}
      />
      <StatCard
        icon={ArrowUpRight}
        label="Saídas"
        tone="danger"
        value={formatMoney(totals.expense)}
      />
      <StatCard
        icon={Wallet}
        label="Saldo"
        value={formatMoney(totals.balance)}
        valueTone={totals.balance < 0 ? 'danger' : undefined}
      />
    </div>
  );
}

const brDate = (value: string) => (value ? value.split('-').reverse().join('/') : '');
// A saída de uma conta paga só se corrige em Receber e pagar.
const fromPayable = (row: { id: string }) => row.id.startsWith('cash-payable-');

function Methods({ methods }: { methods: MethodTotal[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Por forma de pagamento</p>
      {methods.length ? (
        <ul className="grid gap-2 text-sm">
          {methods.map((item) => (
            <li className="flex items-center justify-between gap-3" key={item.method}>
              <span className="text-muted-foreground">{item.method}</span>
              <span className="font-medium tabular-nums">{formatMoney(item.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma entrada no período.</p>
      )}
    </div>
  );
}

export default function FinanceRoute({
  summary,
  initialHistory,
  initialSection = 'overview',
}: {
  summary: {
    today: CashTotals & { methods: MethodTotal[] };
    month: { current: CashTotals; previous: CashTotals };
    receivables: Awaited<ReturnType<typeof import('@/lib/repos/cash').receivables>>;
    review: Awaited<ReturnType<typeof import('@/lib/repos/cash').review>>;
  };
  initialHistory: CashHistoryRow[];
  initialSection?: FinanceSection;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [rows, setRows] = useState<FinanceRow[]>(initialHistory.map(toFinanceRow));
  const [period, setPeriod] = useState<CashPeriod>('today');
  const [section, setSection] = useState<FinanceSection>(initialSection);
  const [modal, setModal] = useState<MoneyKind | null>(null);
  const [editing, setEditing] = useState<FinanceRow | null>(null);
  const [charging, setCharging] = useState<{ id: string; code: string; total: number } | null>(
    null,
  );

  const changePeriod = async (next: CashPeriod) => {
    const previous = period;
    setPeriod(next);
    try {
      const response = await fetch(`/api/cash/history?period=${next}`);
      const result = (await response.json()) as { error?: string; rows?: CashHistoryRow[] };
      if (!response.ok || !result.rows) throw new Error(result.error || 'Histórico indisponível.');
      setRows(result.rows.map(toFinanceRow));
    } catch (error) {
      setPeriod(previous);
      notify(error instanceof Error ? error.message : 'Histórico indisponível.', 'error');
    }
  };

  const save: SaveMoney = async (kind: MoneyKind, data: MoneyData, id?: string) => {
    try {
      const resource = kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: MoneyData };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o lançamento.');
      const previous = id ? rows.find((row) => row.id === id) : undefined;
      const saved = {
        id: result.record.id,
        ...result.record.data,
        kind,
        order: previous?.order ?? null,
      } as FinanceRow;
      setRows((current) =>
        id ? current.map((row) => (row.id === id ? saved : row)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
      router.refresh();
      notify(
        id
          ? kind === 'payment'
            ? 'Recebimento atualizado.'
            : 'Despesa atualizada.'
          : kind === 'payment'
            ? 'Recebimento salvo.'
            : 'Despesa salva.',
        'success',
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.',
        'error',
      );
      throw error;
    }
  };

  const create = (kind: MoneyKind) => {
    setEditing(null);
    setModal(kind);
  };

  const edit = (row: FinanceRow) => {
    setEditing(row);
    setModal(row.kind);
  };

  const remove = async (row: FinanceRow) => {
    if (!(await confirm(`Excluir definitivamente o lançamento ${row.description}?`))) return;
    try {
      const resource = row.kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o lançamento.');
      setRows((current) => current.filter((item) => item.id !== row.id));
      router.refresh();
      notify('Lançamento excluído.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o lançamento.',
        'error',
      );
    }
  };

  const currentMonth = summary.month.current;
  const previousMonth = summary.month.previous;
  const resultVariation = variation(currentMonth.balance, previousMonth.balance);
  const incomeVariation = variation(currentMonth.income, previousMonth.income);
  const expenseVariation = variation(currentMonth.expense, previousMonth.expense);
  const sorted = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return (
    <>
      <PageHeader
        title="Caixa"
        description="O que entrou e o que saiu, hoje e no mês."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              onClick={() => create('expense')}
              variant="outline"
            >
              <ArrowUpRight aria-hidden="true" />
              Lançar saída
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => create('payment')}>
              <ArrowDownLeft aria-hidden="true" />
              Lançar entrada
            </Button>
          </div>
        }
      />

      <Segmented label="Seções do caixa" onChange={setSection} options={sections} value={section} />

      {section === 'overview' && (
        <div className="mt-4 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Hoje</CardTitle>
              <CardDescription>Entradas e saídas do dia em São Paulo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <TotalsGrid totals={summary.today} />
              <Methods methods={summary.today.methods} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <IconChip icon={ArrowDownLeft} tone="success" />
                <div className="grid gap-1">
                  <CardTitle>A receber</CardTitle>
                  <CardDescription>
                    {formatMoney(summary.receivables.ready.amount)} em{' '}
                    {summary.receivables.ready.orders}{' '}
                    {summary.receivables.ready.orders === 1 ? 'OS concluída' : 'OS concluídas'} ·{' '}
                    {formatMoney(summary.receivables.inProgress.amount)} ainda no conserto
                  </CardDescription>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/receber-e-pagar?ver=receber">Ver tudo</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {summary.receivables.ready.list.length ? (
                <ul className="divide-y overflow-hidden rounded-lg ring-1 ring-foreground/10">
                  {summary.receivables.ready.list.map((order) => (
                    <ListRow
                      actions={
                        <Button
                          aria-label={`Registrar recebimento da ${order.code}`}
                          className="w-20"
                          onClick={() => setCharging(order)}
                          size="sm"
                        >
                          Receber
                        </Button>
                      }
                      details={
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/ordens?busca=${encodeURIComponent(order.code)}`}
                        >
                          {order.code}
                        </Link>
                      }
                      key={order.id}
                      leading={<IconChip icon={ArrowDownLeft} tone="success" />}
                      title={order.customer}
                      value={`+${formatMoney(order.total)}`}
                      valueClassName={toneText.success}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma OS concluída esperando pagamento.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'analysis' && (
        <div className="mt-4 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Este mês</CardTitle>
              <CardDescription>Comparação com o mesmo período anterior.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem]">
              <div className="grid gap-3">
                <p className="text-sm font-medium">Mês atual</p>
                <TotalsGrid totals={currentMonth} />
              </div>
              <div className="grid gap-3">
                <p className="text-sm font-medium">Mesmo período anterior</p>
                <TotalsGrid totals={previousMonth} />
              </div>
              <div className="grid content-start gap-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">Variação do resultado</p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(resultVariation.absolute)}
                </p>
                <p className="text-muted-foreground">
                  {resultVariation.percent === null
                    ? '—'
                    : `${resultVariation.percent.toFixed(1)}%`}
                </p>
                <p className="sr-only">
                  Receita: {incomeVariation.percent === null ? '—' : `${incomeVariation.percent}%`};
                  despesas:{' '}
                  {expenseVariation.percent === null ? '—' : `${expenseVariation.percent}%`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conferir</CardTitle>
              <CardDescription>Casos que precisam de decisão manual.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryMetric
                  detail={`${summary.review.divergent.orders} OS`}
                  label="Divergências"
                  value={String(summary.review.divergent.orders)}
                />
                <SummaryMetric
                  label="Total a completar"
                  value={formatMoney(summary.review.divergent.toCollect)}
                />
                <SummaryMetric
                  label="Recebido acima"
                  value={formatMoney(summary.review.divergent.overpaid)}
                />
              </div>
              <div className="grid gap-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">OS canceladas com recebimento</p>
                <p>
                  {summary.review.cancelledPaid.orders} OS ·{' '}
                  {formatMoney(summary.review.cancelledPaid.amount)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Estes casos ficam fora de A receber e não geram cobrança automática.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'entries' && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>Filtre os lançamentos por competência.</CardDescription>
            </div>
            <Select
              onValueChange={(value) => void changePeriod(value as CashPeriod)}
              value={period}
            >
              <SelectTrigger aria-label="Período do histórico" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {sorted.length ? (
              <ListGroup
                aside={
                  <>
                    <span className={toneText.success}>
                      +
                      {formatMoney(
                        sorted
                          .filter((row) => row.kind === 'payment')
                          .reduce((sum, row) => sum + Number(row.value || 0), 0),
                      )}
                    </span>
                    <span>
                      −
                      {formatMoney(
                        sorted
                          .filter((row) => row.kind === 'expense')
                          .reduce((sum, row) => sum + Number(row.value || 0), 0),
                      )}
                    </span>
                  </>
                }
                count={sorted.length}
                title={periods.find((item) => item.value === period)?.label || 'Lançamentos'}
              >
                {sorted.map((row) => {
                  const entry = row.kind === 'payment';
                  return (
                    <ListRow
                      actions={
                        fromPayable(row) ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href="/receber-e-pagar?ver=pagar">Ver a conta</Link>
                          </Button>
                        ) : (
                          <>
                            <Button onClick={() => edit(row)} size="sm" variant="outline">
                              Editar
                            </Button>
                            <RowMenu label={row.description}>
                              <DropdownMenuItem
                                onSelect={() => void remove(row)}
                                variant="destructive"
                              >
                                Excluir
                              </DropdownMenuItem>
                            </RowMenu>
                          </>
                        )
                      }
                      details={
                        <>
                          {row.order ? (
                            <Link
                              className="underline-offset-4 hover:underline"
                              href={`/ordens?busca=${encodeURIComponent(row.order.code)}`}
                            >
                              {row.order.code}
                            </Link>
                          ) : (
                            row.reference
                          )}
                          {(row.order || row.reference) && row.method ? ' · ' : ''}
                          {row.method}
                        </>
                      }
                      key={row.id}
                      leading={
                        <IconChip
                          icon={entry ? ArrowDownLeft : ArrowUpRight}
                          tone={entry ? 'success' : 'danger'}
                        />
                      }
                      note={brDate(String(row.date || ''))}
                      srPrefix={entry ? 'Entrada: ' : 'Saída: '}
                      title={row.description}
                      value={`${entry ? '+' : '−'}${formatMoney(row.value)}`}
                      valueClassName={entry ? toneText.success : undefined}
                    />
                  );
                })}
              </ListGroup>
            ) : (
              <EmptyState
                title="Sem lançamentos neste período"
                description="Registre um recebimento ou despesa para iniciar o controle do caixa."
              />
            )}
          </CardContent>
        </Card>
      )}

      {modal && (
        <MoneyModal
          kind={modal}
          item={editing || undefined}
          close={() => setModal(null)}
          save={save}
        />
      )}
      {charging && (
        <OrderPaymentDialog
          close={() => setCharging(null)}
          order={charging}
          saved={() => {
            setCharging(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
