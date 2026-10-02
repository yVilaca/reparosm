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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryMetric label="Entradas" value={formatMoney(totals.income)} />
      <SummaryMetric label="Saídas" value={formatMoney(totals.expense)} />
      <SummaryMetric label="Saldo" value={formatMoney(totals.balance)} />
    </div>
  );
}

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
}: {
  summary: {
    today: CashTotals & { methods: MethodTotal[] };
    month: { current: CashTotals; previous: CashTotals };
    receivables: Awaited<ReturnType<typeof import('@/lib/repos/cash').receivables>>;
    review: Awaited<ReturnType<typeof import('@/lib/repos/cash').review>>;
  };
  initialHistory: CashHistoryRow[];
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [rows, setRows] = useState<FinanceRow[]>(initialHistory.map(toFinanceRow));
  const [period, setPeriod] = useState<CashPeriod>('today');
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
        title="Financeiro"
        description="Fechamento do caixa, valores a receber e histórico por período."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => create('expense')}
              variant="outline"
            >
              Despesa
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => create('payment')}>
              Recebimento
            </Button>
          </div>
        }
      />

      <div className="grid gap-4">
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
          <CardHeader>
            <CardTitle>Este mês</CardTitle>
            <CardDescription>Comparação com o mesmo período anterior.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
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
              <p className="font-semibold tabular-nums">{formatMoney(resultVariation.absolute)}</p>
              <p className="text-muted-foreground">
                {resultVariation.percent === null ? '—' : `${resultVariation.percent.toFixed(1)}%`}
              </p>
              <p className="sr-only">
                Receita: {incomeVariation.percent === null ? '—' : `${incomeVariation.percent}%`};
                despesas: {expenseVariation.percent === null ? '—' : `${expenseVariation.percent}%`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>A receber</CardTitle>
            <CardDescription>Ordens sem recebimento vinculado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div className="grid gap-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Pronto para retirar</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.receivables.ready.orders} OS
                  </p>
                </div>
                <strong className="tabular-nums">
                  {formatMoney(summary.receivables.ready.amount)}
                </strong>
              </div>
              {summary.receivables.ready.list.length ? (
                <ul className="grid gap-2 border-t pt-3 text-sm">
                  {summary.receivables.ready.list.map((order) => (
                    <li className="flex items-center justify-between gap-3" key={order.id}>
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                          href={`/ordens?busca=${encodeURIComponent(order.code)}`}
                        >
                          {order.code} · {order.customer}
                        </Link>
                        <span className="shrink-0 tabular-nums">{formatMoney(order.total)}</span>
                      </div>
                      <Button
                        onClick={() => setCharging(order)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Registrar recebimento
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t pt-3 text-sm text-muted-foreground">Nenhuma OS pronta.</p>
              )}
            </div>
            <div className="grid gap-3 rounded-lg border p-4">
              <div>
                <p className="font-medium">Em andamento</p>
                <p className="text-sm text-muted-foreground">
                  {summary.receivables.inProgress.orders} OS sem recebimento
                </p>
              </div>
              <strong className="text-2xl tabular-nums">
                {formatMoney(summary.receivables.inProgress.amount)}
              </strong>
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

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Filtre os lançamentos por competência.</CardDescription>
          </div>
          <Select onValueChange={(value) => void changePeriod(value as CashPeriod)} value={period}>
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
            <>
              <div className="grid gap-3 md:hidden">
                {sorted.map((row) => (
                  <article className="grid gap-3 rounded-lg border p-4" key={row.id}>
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={row.kind === 'payment' ? 'success' : 'destructive'}>
                        {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                      </Badge>
                      <strong
                        className={
                          row.kind === 'expense'
                            ? 'text-destructive'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {row.kind === 'expense' ? '- ' : '+ '}
                        {formatMoney(row.value)}
                      </strong>
                    </div>
                    <div>
                      <h3 className="font-medium">{row.description}</h3>
                      {row.order ? (
                        <Link
                          className="text-sm text-primary underline-offset-4 hover:underline"
                          href={`/ordens?busca=${encodeURIComponent(row.order.code)}`}
                        >
                          {row.order.code}
                        </Link>
                      ) : (
                        row.reference && (
                          <p className="text-sm text-muted-foreground">{row.reference}</p>
                        )
                      )}
                    </div>
                    <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                      <span>{row.method}</span>
                      <span>{row.date}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => edit(row)}
                        size="sm"
                        variant="outline"
                      >
                        Editar
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => void remove(row)}
                        size="sm"
                        variant="destructive"
                      >
                        Excluir
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant={row.kind === 'payment' ? 'success' : 'destructive'}>
                            {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{row.description}</p>
                          {row.order ? (
                            <Link
                              className="text-xs text-primary underline-offset-4 hover:underline"
                              href={`/ordens?busca=${encodeURIComponent(row.order.code)}`}
                            >
                              {row.order.code}
                            </Link>
                          ) : (
                            row.reference && (
                              <p className="text-xs text-muted-foreground">{row.reference}</p>
                            )
                          )}
                        </TableCell>
                        <TableCell>{row.method}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell
                          className={
                            row.kind === 'expense'
                              ? 'font-medium text-destructive'
                              : 'font-medium text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {row.kind === 'expense' ? '- ' : '+ '}
                          {formatMoney(row.value)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button onClick={() => edit(row)} size="sm" variant="outline">
                              Editar
                            </Button>
                            <Button
                              onClick={() => void remove(row)}
                              size="sm"
                              variant="destructive"
                            >
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              title="Sem lançamentos neste período"
              description="Registre um recebimento ou despesa para iniciar o controle do caixa."
            />
          )}
        </CardContent>
      </Card>

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
