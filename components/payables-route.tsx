'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { cn } from 'cn';
import { useFeedback } from '@/components/feedback';
import PayableFormDialog from '@/components/payable-form-dialog';
import PayablePayDialog, {
  copyPaymentCode,
  paymentDifference,
  type PaidResult,
  type PayableRow,
} from '@/components/payable-pay-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import { recurrenceLabels } from '@/lib/payable-recurrence';
import {
  dueLabel,
  groupOpenPayables,
  groupPaidPayables,
  matchesPayable,
  summarizePayables,
  type DueGroup,
} from '@/lib/payable-schedule';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { PayableRecord } from '@/lib/repos/payables';

type Mode = 'all' | 'purchases';
type Tab = 'open' | 'paid';

const groupTitles: Record<DueGroup, string> = {
  overdue: 'Vencidas',
  today: 'Vencem hoje',
  week: 'Próximos 7 dias',
  later: 'Mais adiante',
  undated: 'Sem vencimento',
};

const toRow = (record: PayableRecord): PayableRow => ({ id: record.id, ...record.data });
const brDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
const optionsFrom = (values: (string | undefined)[]) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
const monthOf = (today: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${today}T12:00:00Z`),
  );
/** Último dia da janela "próximos 7 dias", como dd/mm. */
const weekEnd = (today: string) =>
  brDate(
    new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10),
  ).slice(0, 5);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Forma usada da última vez para a mesma série ou o mesmo fornecedor. */
function lastMethodFor(rows: PayableRow[], payable: PayableRow) {
  return rows
    .filter(
      (row) =>
        row.status === 'paid' &&
        row.method &&
        ((payable.seriesId && row.seriesId === payable.seriesId) ||
          (payable.supplier && row.supplier === payable.supplier)),
    )
    .sort((a, b) => (b.paidOn || '').localeCompare(a.paidOn || ''))[0]?.method;
}

function details(row: PayableRow, mode: Mode) {
  return [
    mode === 'all' && row.source === 'purchase' ? 'Compra' : null,
    row.supplier,
    row.category,
    row.installmentCount ? `Parcela ${row.installmentNumber} de ${row.installmentCount}` : null,
    row.recurrence ? `Repete · ${recurrenceLabels[row.recurrence]}` : null,
  ].filter(Boolean);
}

export default function PayablesRoute({
  initialPayables,
  mode = 'all',
  title = 'Contas a pagar',
  description = 'O que vence, o que já venceu e o que você pagou.',
  payId,
}: {
  initialPayables: PayableRecord[];
  mode?: Mode;
  title?: string;
  description?: string;
  /** Conta a abrir direto no diálogo de pagamento (link do painel Hoje). */
  payId?: string;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const today = todayInSaoPaulo();
  const [rows, setRows] = useState<PayableRow[]>(() => initialPayables.map(toRow));
  const linked = rows.find((row) => row.id === payId);
  const [tab, setTab] = useState<Tab>(linked?.status === 'paid' ? 'paid' : 'open');
  const [query, setQuery] = useState('');
  // undefined: formulário fechado; null: conta nova.
  const [editing, setEditing] = useState<PayableRow | null | undefined>(undefined);
  const [paying, setPaying] = useState<PayableRow | null>(
    linked && linked.status !== 'paid' ? linked : null,
  );

  const scoped = rows.filter((row) => mode !== 'purchases' || row.source === 'purchase');
  const visible = scoped.filter((row) => matchesPayable(row, query));
  const summary = summarizePayables(scoped, today);
  const openGroups = groupOpenPayables(visible, today);
  const paidGroups = groupPaidPayables(visible);
  const openCount = visible.filter((row) => row.status !== 'paid').length;
  const paidCount = visible.length - openCount;
  const hasOpen = scoped.some((row) => row.status !== 'paid');
  const hasPaid = scoped.some((row) => row.status === 'paid');
  const newLabel = mode === 'purchases' ? 'Nova compra' : 'Nova conta';

  const merge = (records: PayableRecord[], removedId?: string) =>
    setRows((current) => {
      const incoming = new Map(records.map((record) => [record.id, toRow(record)]));
      const kept = current
        .filter((row) => row.id !== removedId)
        .map((row) => incoming.get(row.id) || row);
      const known = new Set(kept.map((row) => row.id));
      return [...kept, ...[...incoming.values()].filter((row) => !known.has(row.id))];
    });

  const closePay = () => {
    setPaying(null);
    if (payId) router.replace('/contas-pagar', { scroll: false });
  };

  const afterSaved = (records: PayableRecord[]) => {
    const updating = Boolean(editing);
    merge(records);
    setEditing(undefined);
    setTab('open');
    router.refresh();
    notify(
      updating
        ? 'Conta atualizada.'
        : records.length > 1
          ? `${records.length} parcelas registradas.`
          : mode === 'purchases'
            ? 'Compra registrada.'
            : 'Conta registrada.',
      'success',
    );
  };

  const afterPaid = ({ record, nextRecord }: PaidResult) => {
    merge(nextRecord ? [record, nextRecord] : [record]);
    closePay();
    router.refresh();
    const value = formatMoney(record.data.paidAmount ?? record.data.amount);
    notify(
      `Pago. Saída de ${value} lançada no Caixa.${
        nextRecord?.data.dueDate ? ` Próxima conta: ${brDate(nextRecord.data.dueDate)}.` : ''
      }`,
      'success',
    );
  };

  const undo = async (row: PayableRow) => {
    const value = formatMoney(row.paidAmount ?? row.amount);
    const message = `Desfazer o pagamento de ${row.description}? A saída de ${value} sai do Caixa e a conta volta para "A pagar".${
      row.recurrence ? ' A próxima conta que esse pagamento criou também é removida.' : ''
    }`;
    if (!(await confirm(message))) return;
    try {
      const response = await fetch('/api/payables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action: 'undo' }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: PayableRecord;
        removedNextId?: string;
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível desfazer o pagamento.');
      merge([result.record], result.removedNextId);
      router.refresh();
      notify('Pagamento desfeito. A conta voltou para "A pagar".', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível desfazer o pagamento.',
        'error',
      );
    }
  };

  const remove = async (row: PayableRow) => {
    const which = row.installmentCount
      ? ` (só a parcela ${row.installmentNumber} de ${row.installmentCount})`
      : '';
    if (!(await confirm(`Excluir ${row.description}${which}? Isso não pode ser desfeito.`))) return;
    const response = await fetch(`/api/payables?id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      notify(result.error || 'Não foi possível excluir a conta.', 'error');
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    router.refresh();
    notify('Conta excluída.', 'success');
  };

  const copy = (code: string) => void copyPaymentCode(code, (message) => notify(message));

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden="true" />
            {newLabel}
          </Button>
        }
      />
      <section aria-label="Resumo das contas" className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Vencidas"
          tone={summary.overdue.count ? 'danger' : undefined}
          value={formatMoney(summary.overdue.amount)}
          detail={
            summary.overdue.count
              ? plural(summary.overdue.count, 'conta', 'contas')
              : 'Nada vencido'
          }
        />
        <SummaryCard
          label="Próximos 7 dias"
          value={formatMoney(summary.upcoming.amount)}
          detail={
            summary.upcoming.count
              ? `${plural(summary.upcoming.count, 'conta', 'contas')}, até ${weekEnd(today)}`
              : 'Nada vencendo'
          }
        />
        <SummaryCard
          label={`Pago em ${monthOf(today)}`}
          value={formatMoney(summary.paidThisMonth.amount)}
          detail={plural(summary.paidThisMonth.count, 'conta paga', 'contas pagas')}
        />
      </section>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-label="Mostrar contas"
          className="inline-flex self-start rounded-lg bg-muted p-1"
          role="group"
        >
          {(
            [
              ['open', 'A pagar', openCount],
              ['paid', 'Pagas', paidCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              aria-pressed={tab === value}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                tab === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {label}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar por descrição, fornecedor ou categoria"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conta ou fornecedor"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div className="grid gap-6">
        {tab === 'open' ? (
          openGroups.length ? (
            openGroups.map((group) => (
              <Group
                count={group.rows.length}
                key={group.group}
                title={groupTitles[group.group]}
                tone={group.group === 'overdue' ? 'danger' : undefined}
                total={group.total}
              >
                {group.rows.map((row) => (
                  <Row
                    amount={formatMoney(row.amount)}
                    details={details(row, mode)}
                    key={row.id}
                    menu={
                      <RowMenu label={row.description}>
                        {row.paymentCode && (
                          <DropdownMenuItem onSelect={() => copy(row.paymentCode!)}>
                            Copiar código de pagamento
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setEditing(row)}>Editar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void remove(row)} variant="destructive">
                          Excluir
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                    note={group.group === 'undated' ? undefined : dueLabel(row.dueDate, today)}
                    noteTone={
                      group.group === 'overdue'
                        ? 'danger'
                        : group.group === 'today'
                          ? 'warning'
                          : undefined
                    }
                    primary={
                      // Destaque só no que é urgente; o resto não compete pela atenção.
                      <Button
                        onClick={() => setPaying(row)}
                        size="sm"
                        variant={
                          group.group === 'overdue' || group.group === 'today'
                            ? 'default'
                            : 'outline'
                        }
                      >
                        Pagar
                      </Button>
                    }
                    title={row.description}
                  />
                ))}
              </Group>
            ))
          ) : query && hasOpen ? (
            <EmptyState
              title="Nada encontrado"
              description={`Nenhuma conta a pagar com “${query}”.`}
            />
          ) : (
            <EmptyState
              action={
                <Button onClick={() => setEditing(null)} variant="outline">
                  <Plus aria-hidden="true" />
                  {newLabel}
                </Button>
              }
              description={
                mode === 'purchases'
                  ? 'Registre as compras a prazo para ver aqui o que vence.'
                  : 'Cadastre aluguel, energia, compras a prazo e outras contas para ver aqui o que vence.'
              }
              title="Nenhuma conta em aberto"
            />
          )
        ) : paidGroups.length ? (
          paidGroups.map((group) => (
            <Group
              count={group.rows.length}
              key={group.month}
              title={group.label}
              total={group.total}
            >
              {group.rows.map((row) => {
                const difference = paymentDifference(row.amount, row.paidAmount ?? row.amount);
                return (
                  <Row
                    amount={formatMoney(row.paidAmount ?? row.amount)}
                    details={details(row, mode)}
                    key={row.id}
                    menu={
                      <RowMenu label={row.description}>
                        <DropdownMenuItem onSelect={() => void undo(row)}>
                          Desfazer pagamento
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                    note={[
                      row.paidOn ? `Pago em ${brDate(row.paidOn)}` : 'Pago',
                      row.method,
                      difference,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    title={row.description}
                  />
                );
              })}
            </Group>
          ))
        ) : query && hasPaid ? (
          <EmptyState title="Nada encontrado" description={`Nenhuma conta paga com “${query}”.`} />
        ) : (
          <EmptyState
            description="Quando você registrar um pagamento, ele aparece aqui, separado por mês."
            title="Nenhuma conta paga ainda"
          />
        )}
      </div>

      {editing !== undefined && (
        <PayableFormDialog
          categories={optionsFrom(rows.map((row) => row.category))}
          close={() => setEditing(undefined)}
          defaultKind={mode === 'purchases' ? 'purchase' : 'expense'}
          item={editing}
          saved={afterSaved}
          suppliers={optionsFrom(rows.map((row) => row.supplier))}
        />
      )}
      {paying && (
        <PayablePayDialog
          close={closePay}
          paid={afterPaid}
          payable={paying}
          suggestedMethod={lastMethodFor(rows, paying)}
        />
      )}
    </>
  );
}

type Tone = 'danger' | 'warning' | undefined;

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  // No celular, rótulo à esquerda e valor à direita: os três cabem sem empurrar a lista.
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-1 sm:items-start">
        <p className="text-sm text-muted-foreground">{label}</p>
        <strong
          className={cn(
            'row-span-2 text-lg tabular-nums sm:row-span-1 sm:text-xl',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value}
        </strong>
        <p className="col-start-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  count,
  total,
  tone,
  children,
}: {
  title: string;
  count: number;
  total: number;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-2">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h2 className={cn('text-sm font-semibold', tone === 'danger' && 'text-destructive')}>
          {title}
          <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>
        </h2>
        <span className="text-sm font-medium tabular-nums">{formatMoney(total)}</span>
      </header>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {children}
      </ul>
    </section>
  );
}

function Row({
  title,
  details,
  amount,
  note,
  noteTone,
  primary,
  menu,
}: {
  title: string;
  details: (string | null | undefined)[];
  amount: string;
  note?: string;
  noteTone?: Tone;
  primary?: ReactNode;
  menu: ReactNode;
}) {
  // No celular: título na primeira linha; valor e ações sempre juntos na segunda.
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-56">
        <p className="font-medium break-words">{title}</p>
        {details.length > 0 && (
          <p className="text-sm break-words text-muted-foreground">{details.join(' · ')}</p>
        )}
      </div>
      <div className="sm:text-right">
        <p className="font-semibold tabular-nums">{amount}</p>
        {note && (
          <p
            className={cn(
              'text-xs',
              noteTone === 'danger'
                ? 'font-medium text-destructive'
                : noteTone === 'warning'
                  ? 'font-medium text-amber-700 dark:text-amber-300'
                  : 'text-muted-foreground',
            )}
          >
            {note}
          </p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {primary}
        {menu}
      </div>
    </li>
  );
}

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`Mais ações: ${label}`} size="icon-sm" variant="ghost">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
