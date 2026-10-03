'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Plus, Search } from 'lucide-react';
import { cn } from 'cn';
import { openWhatsapp } from '@/components/dashboard-actions';
import { useFeedback } from '@/components/feedback';
import OrderPaymentDialog from '@/components/order-payment-dialog';
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
import {
  groupAgenda,
  groupHistory,
  matchesOrder,
  receivableGroup,
  receivableLabel,
  receivableState,
  summarizeAgenda,
  type AgendaGroup,
  type Receipt,
  type ReceivableOrder,
} from '@/lib/agenda';
import { formatMoney, hasValidWhatsapp } from '@/lib/format';
import { recurrenceLabels } from '@/lib/payable-recurrence';
import { dueLabel, matchesPayable } from '@/lib/payable-schedule';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderPayment } from '@/lib/types';
import type { PayableRecord } from '@/lib/repos/payables';

export type Direction = 'receive' | 'pay';
type Filter = 'all' | Direction;
type Tab = 'open' | 'done';
type Tone = 'danger' | 'warning' | undefined;

export const RECEIVE_PAY_PATH = '/receber-e-pagar';

const groupTitles: Record<AgendaGroup, string> = {
  overdue: 'Atrasados',
  today: 'Hoje',
  week: 'Próximos 7 dias',
  later: 'Mais adiante',
  repair: 'No conserto',
  undated: 'Sem vencimento',
};
const groupHints: Partial<Record<AgendaGroup, string>> = {
  repair: 'Recebe quando ficar pronta',
};

const toRow = (record: PayableRecord): PayableRow => ({ id: record.id, ...record.data });
const brDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
const shortDate = (isoDate: string) => brDate(isoDate).slice(0, 5);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const optionsFrom = (values: (string | undefined)[]) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );

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

function billDetails(row: PayableRow) {
  return [
    row.source === 'purchase' ? 'Compra' : null,
    row.supplier,
    row.category,
    row.installmentCount ? `Parcela ${row.installmentNumber} de ${row.installmentCount}` : null,
    row.recurrence ? `Repete · ${recurrenceLabels[row.recurrence]}` : null,
  ];
}

/** Ajusta o estado local quando o servidor manda dados novos (depois de router.refresh). */
function useServerState<T>(server: T) {
  const [value, setValue] = useState(server);
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    setValue(server);
  }
  return [value, setValue] as const;
}

export default function ReceivePayRoute({
  initialOrders,
  initialReceipts,
  initialPayables,
  historySince,
  view,
  payId,
}: {
  initialOrders: ReceivableOrder[];
  initialReceipts: Receipt[];
  initialPayables: PayableRecord[];
  /** Início da janela de "Pagos e recebidos". */
  historySince: string;
  /** Filtro inicial (`?ver=receber|pagar`). */
  view?: Direction;
  /** Conta a abrir direto no pagamento (`?pagar=<id>`). */
  payId?: string;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const today = todayInSaoPaulo();
  const [orders, setOrders] = useServerState(initialOrders);
  const [receipts, setReceipts] = useServerState(initialReceipts);
  const [payableRecords, setPayableRecords] = useServerState(initialPayables);
  const rows = payableRecords.map(toRow);
  const linked = rows.find((row) => row.id === payId);
  const [filter, setFilter] = useState<Filter>(view || 'all');
  const [tab, setTab] = useState<Tab>(linked?.status === 'paid' ? 'done' : 'open');
  const [query, setQuery] = useState('');
  // undefined: formulário fechado; null: conta nova.
  const [editing, setEditing] = useState<PayableRow | null | undefined>(undefined);
  const [paying, setPaying] = useState<PayableRow | null>(
    linked && linked.status !== 'paid' ? linked : null,
  );
  const [receiving, setReceiving] = useState<ReceivableOrder | null>(null);

  const showReceive = filter !== 'pay';
  const showPay = filter !== 'receive';
  const visibleOrders = showReceive ? orders.filter((order) => matchesOrder(order, query)) : [];
  const visibleBills = showPay ? rows.filter((row) => matchesPayable(row, query)) : [];
  const groups = groupAgenda(visibleOrders, visibleBills, today);
  const visibleReceipts = showReceive
    ? receipts.filter((receipt) => matchesOrder(receipt, query))
    : [];
  const paidBills = visibleBills.filter(
    (row) => row.status === 'paid' && (row.paidOn || '') >= historySince,
  );
  const months = groupHistory(visibleReceipts, paidBills);
  const openCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const doneCount = months.reduce((sum, month) => sum + month.items.length, 0);
  const summary = summarizeAgenda(orders, rows, today);

  const setRecords = (records: PayableRecord[], removedId?: string) =>
    setPayableRecords((current) => {
      const incoming = new Map(records.map((record) => [record.id, record]));
      const kept = current
        .filter((record) => record.id !== removedId)
        .map((record) => incoming.get(record.id) || record);
      const known = new Set(kept.map((record) => record.id));
      return [...kept, ...records.filter((record) => !known.has(record.id))];
    });

  const closePay = () => {
    setPaying(null);
    if (payId)
      router.replace(
        view ? `${RECEIVE_PAY_PATH}?ver=${view === 'pay' ? 'pagar' : 'receber'}` : RECEIVE_PAY_PATH,
        {
          scroll: false,
        },
      );
  };

  const afterSaved = (records: PayableRecord[]) => {
    const updating = Boolean(editing);
    setRecords(records);
    setEditing(undefined);
    setTab('open');
    router.refresh();
    notify(
      updating
        ? 'Conta atualizada.'
        : records.length > 1
          ? `${records.length} parcelas registradas.`
          : 'Conta registrada.',
      'success',
    );
  };

  const afterPaid = ({ record, nextRecord }: PaidResult) => {
    setRecords(nextRecord ? [record, nextRecord] : [record]);
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

  // O diálogo de recebimento já avisa o resultado; aqui só se atualiza a lista.
  const afterReceived = (order: ReceivableOrder, payment: OrderPayment) => {
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setReceipts((current) => [
      {
        id: payment.id || `payment-${order.id}`,
        orderId: order.id,
        code: order.code,
        customer: order.customer,
        device: order.device,
        value: payment.value ?? order.total,
        ...(payment.method ? { method: payment.method } : {}),
        date: payment.date || today,
      },
      ...current.filter((receipt) => receipt.orderId !== order.id),
    ]);
    setReceiving(null);
    router.refresh();
  };

  const undoPayment = async (row: PayableRow) => {
    const value = formatMoney(row.paidAmount ?? row.amount);
    const message = `Desfazer o pagamento de ${row.description}? A saída de ${value} sai do Caixa e a conta volta para "Em aberto".${
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
      setRecords([result.record], result.removedNextId);
      router.refresh();
      notify('Pagamento desfeito. A conta voltou para "Em aberto".', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível desfazer o pagamento.',
        'error',
      );
    }
  };

  const undoReceipt = async (receipt: Receipt) => {
    const message = `Desfazer o recebimento da ${receipt.code} (${receipt.customer})? A entrada de ${formatMoney(receipt.value)} sai do Caixa e a OS volta para "Em aberto".`;
    if (!(await confirm(message))) return;
    const response = await fetch(`/api/payments?id=${encodeURIComponent(receipt.id)}`, {
      method: 'DELETE',
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      notify(result.error || 'Não foi possível desfazer o recebimento.', 'error');
      return;
    }
    setReceipts((current) => current.filter((item) => item.id !== receipt.id));
    // A OS volta com etapa e idade do servidor.
    router.refresh();
    notify('Recebimento desfeito. A OS voltou para "Em aberto".', 'success');
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
    setPayableRecords((current) => current.filter((record) => record.id !== row.id));
    router.refresh();
    notify('Conta excluída.', 'success');
  };

  const message = (order: ReceivableOrder) =>
    receivableState(order) === 'charge'
      ? {
          kind: 'Cobrança',
          label: 'Cobrar pelo WhatsApp',
          text: `Olá, ${firstName(order.customer)}! Tudo bem? Ficou em aberto o pagamento da ${order.code} (${order.device}), no valor de ${formatMoney(order.total)}. Você pode pagar por Pix ou aqui na loja. Qualquer dúvida, é só responder por aqui.`,
        }
      : receivableState(order) === 'pickup'
        ? {
            kind: 'Atualização da OS',
            label: 'Avisar que está pronta',
            text: `Olá, ${firstName(order.customer)}! Seu ${order.device} (${order.code}) está pronto para retirada. O valor é ${formatMoney(order.total)}.`,
          }
        : null;

  const newBill = (
    <Button onClick={() => setEditing(null)}>
      <Plus aria-hidden="true" />
      Nova conta a pagar
    </Button>
  );

  const emptyOpen = query ? (
    <EmptyState title="Nada encontrado" description={`Nenhuma pendência com “${query}”.`} />
  ) : filter === 'receive' ? (
    <EmptyState
      title="Ninguém te deve agora"
      description="As OS com valor aparecem aqui até o recebimento ser registrado."
    />
  ) : filter === 'pay' ? (
    <EmptyState
      action={newBill}
      title="Nenhuma conta em aberto"
      description="Cadastre aluguel, energia, compras a prazo e outras contas para ver aqui o que vence."
    />
  ) : (
    <EmptyState
      action={newBill}
      title="Tudo em dia"
      description="Nenhuma OS esperando pagamento e nenhuma conta em aberto."
    />
  );

  return (
    <>
      <PageHeader
        title="Receber e pagar"
        description="Quem te deve, o que você deve e quando."
        action={newBill}
      />

      <section aria-label="Resumo" className="mb-6 grid grid-cols-2 gap-3">
        <SummaryCard
          direction="receive"
          label="Para receber"
          lines={[
            summary.receive.now.count
              ? `${plural(summary.receive.now.count, 'OS pronta', 'OS prontas')} para cobrar`
              : 'Nenhuma OS pronta',
            summary.receive.repair.count
              ? `+ ${formatMoney(summary.receive.repair.amount)} no conserto`
              : null,
          ]}
          value={formatMoney(summary.receive.now.amount)}
        />
        <SummaryCard
          direction="pay"
          label="Para pagar"
          lines={[
            summary.pay.week.count
              ? `${plural(summary.pay.week.count, 'conta', 'contas')} até ${shortDate(summary.pay.until)}`
              : `Nada até ${shortDate(summary.pay.until)}`,
            summary.pay.overdue.count
              ? { text: `${formatMoney(summary.pay.overdue.amount)} já vencido`, tone: 'danger' }
              : summary.pay.later.count
                ? `+ ${formatMoney(summary.pay.later.amount)} depois`
                : null,
          ]}
          value={formatMoney(summary.pay.week.amount)}
        />
      </section>

      <div className="mb-4 grid gap-3 lg:flex lg:items-center lg:justify-between">
        <div
          aria-label="Mostrar"
          className="inline-flex justify-self-start rounded-lg bg-muted p-1"
          role="group"
        >
          {(
            [
              ['open', 'Em aberto', openCount],
              ['done', 'Pagos e recebidos', doneCount],
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
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:flex sm:items-center">
          <div aria-label="Filtrar por direção" className="flex gap-1.5" role="group">
            {(
              [
                ['all', 'Tudo'],
                ['receive', 'Receber'],
                ['pay', 'Pagar'],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  filter === value
                    ? 'border-foreground bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === 'receive' && <ArrowDownLeft aria-hidden="true" className="size-3.5" />}
                {value === 'pay' && <ArrowUpRight aria-hidden="true" className="size-3.5" />}
                {label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Buscar por cliente, OS, aparelho, conta ou fornecedor"
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente, OS ou conta"
              type="search"
              value={query}
            />
          </div>
        </div>
      </div>

      {tab === 'open' ? (
        <div className="grid gap-6">
          {groups.length
            ? groups.map((group) => {
                const urgent = group.group === 'overdue' || group.group === 'today';
                return (
                  <Group
                    count={group.items.length}
                    hint={groupHints[group.group]}
                    key={group.group}
                    pay={group.pay}
                    receive={group.receive}
                    title={groupTitles[group.group]}
                    tone={group.group === 'overdue' ? 'danger' : undefined}
                  >
                    {group.items.map((item) => {
                      if (item.kind === 'receive') {
                        const order = item.order;
                        const whatsapp =
                          order.phone && hasValidWhatsapp(order.phone) ? message(order) : null;
                        const orderGroup = receivableGroup(order);
                        return (
                          <Row
                            amount={order.total}
                            details={[order.code, order.device]}
                            direction="receive"
                            key={`receive-${order.id}`}
                            menu={
                              <RowMenu label={order.customer}>
                                <DropdownMenuItem asChild>
                                  <Link href={`/ordens?busca=${encodeURIComponent(order.code)}`}>
                                    Abrir OS
                                  </Link>
                                </DropdownMenuItem>
                                {whatsapp && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      openWhatsapp(
                                        {
                                          phone: order.phone!,
                                          message: whatsapp.text,
                                          customer: order.customer,
                                          kind: whatsapp.kind,
                                          orderId: order.id,
                                        },
                                        notify,
                                      )
                                    }
                                  >
                                    {whatsapp.label}
                                  </DropdownMenuItem>
                                )}
                              </RowMenu>
                            }
                            note={receivableLabel(order)}
                            noteTone={
                              orderGroup === 'overdue'
                                ? 'danger'
                                : orderGroup === 'today'
                                  ? 'warning'
                                  : undefined
                            }
                            primary={
                              <Button
                                onClick={() => setReceiving(order)}
                                className="w-20"
                                size="sm"
                                variant={urgent ? 'default' : 'outline'}
                              >
                                Receber
                              </Button>
                            }
                            title={order.customer}
                          />
                        );
                      }
                      const row = item.bill;
                      return (
                        <Row
                          amount={row.amount}
                          details={billDetails(row)}
                          direction="pay"
                          key={`pay-${row.id}`}
                          menu={
                            <RowMenu label={row.description}>
                              {row.paymentCode && (
                                <DropdownMenuItem
                                  onSelect={() => void copyPaymentCode(row.paymentCode!, notify)}
                                >
                                  Copiar código de pagamento
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => setEditing(row)}>
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => void remove(row)}
                                variant="destructive"
                              >
                                Excluir
                              </DropdownMenuItem>
                            </RowMenu>
                          }
                          note={
                            group.group === 'undated' ? undefined : dueLabel(row.dueDate, today)
                          }
                          noteTone={
                            group.group === 'overdue'
                              ? 'danger'
                              : group.group === 'today'
                                ? 'warning'
                                : undefined
                          }
                          primary={
                            <Button
                              onClick={() => setPaying(row)}
                              className="w-20"
                              size="sm"
                              variant={urgent ? 'default' : 'outline'}
                            >
                              Pagar
                            </Button>
                          }
                          title={row.description}
                        />
                      );
                    })}
                  </Group>
                );
              })
            : emptyOpen}
        </div>
      ) : (
        <div className="grid gap-6">
          {months.length ? (
            months.map((month) => (
              <Group
                count={month.items.length}
                key={month.month}
                pay={month.pay}
                receive={month.receive}
                title={month.label}
              >
                {month.items.map((item) => {
                  if (item.kind === 'receive') {
                    const receipt = item.receipt;
                    return (
                      <Row
                        amount={receipt.value}
                        details={[receipt.code, receipt.device]}
                        direction="receive"
                        key={`receipt-${receipt.id}`}
                        menu={
                          <RowMenu label={receipt.customer}>
                            <DropdownMenuItem asChild>
                              <Link href={`/ordens?busca=${encodeURIComponent(receipt.code)}`}>
                                Abrir OS
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void undoReceipt(receipt)}>
                              Desfazer recebimento
                            </DropdownMenuItem>
                          </RowMenu>
                        }
                        note={[`Recebido em ${brDate(receipt.date)}`, receipt.method]
                          .filter(Boolean)
                          .join(' · ')}
                        title={receipt.customer}
                      />
                    );
                  }
                  const row = item.bill;
                  return (
                    <Row
                      amount={row.paidAmount ?? row.amount}
                      details={billDetails(row)}
                      direction="pay"
                      key={`paid-${row.id}`}
                      menu={
                        <RowMenu label={row.description}>
                          <DropdownMenuItem onSelect={() => void undoPayment(row)}>
                            Desfazer pagamento
                          </DropdownMenuItem>
                        </RowMenu>
                      }
                      note={[
                        row.paidOn ? `Pago em ${brDate(row.paidOn)}` : 'Pago',
                        row.method,
                        paymentDifference(row.amount, row.paidAmount ?? row.amount),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      title={row.description}
                    />
                  );
                })}
              </Group>
            ))
          ) : (
            <EmptyState
              title={query ? 'Nada encontrado' : 'Nada pago ou recebido ainda'}
              description={
                query
                  ? `Nenhum pagamento ou recebimento com “${query}”.`
                  : 'Os pagamentos e recebimentos dos últimos 3 meses aparecem aqui, por mês.'
              }
            />
          )}
          <p className="text-center text-sm text-muted-foreground">
            Mostrando desde {brDate(historySince)}. O histórico completo fica no{' '}
            <Link
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="/pagamentos"
            >
              Caixa
            </Link>
            .
          </p>
        </div>
      )}

      {editing !== undefined && (
        <PayableFormDialog
          categories={optionsFrom(rows.map((row) => row.category))}
          close={() => setEditing(undefined)}
          defaultKind="expense"
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
      {receiving && (
        <OrderPaymentDialog
          close={() => setReceiving(null)}
          order={{ id: receiving.id, code: receiving.code, total: receiving.total }}
          saved={(payment) => afterReceived(receiving, payment)}
        />
      )}
    </>
  );
}

const directionStyle = {
  receive: {
    icon: ArrowDownLeft,
    label: 'Receber',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    amount: 'text-emerald-700 dark:text-emerald-300',
    sign: '+',
  },
  pay: {
    icon: ArrowUpRight,
    label: 'Pagar',
    badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    amount: '',
    sign: '−',
  },
} as const;

function DirectionIcon({ direction, className }: { direction: Direction; className?: string }) {
  const style = directionStyle[direction];
  const Icon = style.icon;
  return (
    <span
      aria-hidden="true"
      className={cn('grid size-8 shrink-0 place-items-center rounded-full', style.badge, className)}
    >
      <Icon className="size-4" />
    </span>
  );
}

function SummaryCard({
  direction,
  label,
  value,
  lines,
}: {
  direction: Direction;
  label: string;
  value: string;
  lines: (string | { text: string; tone: Tone } | null)[];
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <div className="flex items-center gap-2">
          <DirectionIcon className="size-6 [&_svg]:size-3.5" direction={direction} />
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <strong className="mt-1 text-lg tabular-nums sm:text-2xl">{value}</strong>
        {lines.map((line) =>
          !line ? null : typeof line === 'string' ? (
            <p className="text-xs text-muted-foreground" key={line}>
              {line}
            </p>
          ) : (
            <p
              className={cn('text-xs font-medium', line.tone === 'danger' && 'text-destructive')}
              key={line.text}
            >
              {line.text}
            </p>
          ),
        )}
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  hint,
  count,
  receive,
  pay,
  tone,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  receive: number;
  pay: number;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-2">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 className={cn('text-sm font-semibold', tone === 'danger' && 'text-destructive')}>
          {title}
          <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>
          {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
        </h2>
        <p className="flex gap-3 text-sm font-medium tabular-nums">
          {receive > 0 && (
            <span className={directionStyle.receive.amount}>+{formatMoney(receive)}</span>
          )}
          {pay > 0 && <span>−{formatMoney(pay)}</span>}
        </p>
      </header>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {children}
      </ul>
    </section>
  );
}

function Row({
  direction,
  title,
  details,
  amount,
  note,
  noteTone,
  primary,
  menu,
}: {
  direction: Direction;
  title: string;
  details: (string | null | undefined)[];
  amount: number;
  note?: string;
  noteTone?: Tone;
  primary?: ReactNode;
  menu: ReactNode;
}) {
  const style = directionStyle[direction];
  const context = details.filter(Boolean).join(' · ');
  // No celular: ícone e título na primeira linha; valor e ações juntos na segunda.
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-64">
        <DirectionIcon direction={direction} />
        <div className="min-w-0">
          <p className="font-medium break-words">
            <span className="sr-only">{style.label}: </span>
            {title}
          </p>
          {context && <p className="text-sm break-words text-muted-foreground">{context}</p>}
        </div>
      </div>
      <div className="min-w-0 flex-1 pl-11 sm:flex-none sm:pl-0 sm:text-right">
        <p className={cn('font-semibold tabular-nums', style.amount)}>
          {style.sign}
          {formatMoney(amount)}
        </p>
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
      <DropdownMenuContent align="end" className="min-w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
