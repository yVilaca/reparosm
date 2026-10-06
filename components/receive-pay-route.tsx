'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Plus, Search } from 'lucide-react';
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
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import IconChip from '@/components/ui/icon-chip';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import RowMenu from '@/components/ui/row-menu';
import FilterPills from '@/components/ui/filter-pills';
import Segmented from '@/components/ui/segmented';
import StatCard from '@/components/ui/stat-card';
import { toneText, type Tone } from '@/components/ui/tone';
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
import { isCashDateRange, summarizeCash } from '@/lib/finance';
import { Label } from '@/components/ui/label';
import type { OrderPayment } from '@/lib/types';
import type { PayableRecord } from '@/lib/repos/payables';

export type Direction = 'receive' | 'pay';
type Filter = 'all' | Direction;
type Tab = 'open' | 'done';

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
  historyUntil = todayInSaoPaulo(),
  showHistory = false,
  view,
  payId,
}: {
  initialOrders: ReceivableOrder[];
  initialReceipts: Receipt[];
  initialPayables: PayableRecord[];
  /** Início da janela de "Pagos e recebidos". */
  historySince: string;
  historyUntil?: string;
  showHistory?: boolean;
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
  const [tab, setTab] = useState<Tab>(showHistory || linked?.status === 'paid' ? 'done' : 'open');
  const [range, setRange] = useState({ from: historySince, to: historyUntil });
  const [seenRange, setSeenRange] = useState([historySince, historyUntil]);
  if (seenRange[0] !== historySince || seenRange[1] !== historyUntil) {
    setSeenRange([historySince, historyUntil]);
    setRange({ from: historySince, to: historyUntil });
  }
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
    ? receipts.filter(
        (receipt) =>
          receipt.date >= historySince &&
          receipt.date <= historyUntil &&
          matchesOrder(receipt, query),
      )
    : [];
  const paidBills = visibleBills.filter(
    (row) =>
      row.status === 'paid' &&
      (row.paidOn || '') >= historySince &&
      (row.paidOn || '') <= historyUntil,
  );
  const months = groupHistory(visibleReceipts, paidBills);
  const openCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const doneCount = months.reduce((sum, month) => sum + month.items.length, 0);
  const summary = summarizeAgenda(orders, rows, today);
  const receivedTotals = summarizeCash(
    receipts
      .filter((receipt) => receipt.date >= historySince && receipt.date <= historyUntil)
      .map((receipt) => ({ ...receipt, kind: 'in' })),
  );

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
    if (payId) {
      const params = new URLSearchParams({ from: historySince, to: historyUntil });
      if (view) params.set('ver', view === 'pay' ? 'pagar' : 'receber');
      if (tab === 'done') params.set('historico', '1');
      router.replace(`${RECEIVE_PAY_PATH}?${params}`, { scroll: false });
    }
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
        cost:
          order.total > 0
            ? Math.round(
                Math.round((order.cost || 0) * 100) *
                  Math.min((payment.value ?? order.total) / order.total, 1),
              ) / 100
            : order.cost || 0,
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
    const message = receipt.orderId
      ? `Desfazer o recebimento da ${receipt.code} (${receipt.customer})? A entrada de ${formatMoney(receipt.value)} sai do Caixa e a OS volta para "Em aberto".`
      : `Desfazer o recebimento de ${receipt.customer}? A entrada de ${formatMoney(receipt.value)} será removida.`;
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
    notify(
      receipt.orderId
        ? 'Recebimento desfeito. A OS voltou para "Em aberto".'
        : 'Recebimento desfeito.',
      'success',
    );
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

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isCashDateRange(range)) {
            notify('Informe um intervalo de datas válido.', 'error');
            return;
          }
          const params = new URLSearchParams({ from: range.from, to: range.to, historico: '1' });
          if (filter !== 'all') params.set('ver', filter === 'receive' ? 'receber' : 'pagar');
          router.push(`${RECEIVE_PAY_PATH}?${params}`);
          setTab('done');
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="received-from">De</Label>
          <Input
            id="received-from"
            type="date"
            required
            max={range.to || undefined}
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="received-to">Até</Label>
          <Input
            id="received-to"
            type="date"
            required
            min={range.from || undefined}
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <Button type="submit" variant="outline">
          Filtrar período
        </Button>
        <p className="basis-full text-xs text-muted-foreground">
          Período dos recebimentos e pagamentos: {brDate(historySince)} a {brDate(historyUntil)}. As
          pendências permanecem completas.
        </p>
      </form>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={ArrowDownLeft}
          label="Total Bruto"
          value={formatMoney(receivedTotals.income)}
          detail="Recebido de OS e vendas rápidas no período."
          tone="success"
        />
        <StatCard
          icon={ArrowDownLeft}
          label="Total Líquido"
          value={formatMoney(receivedTotals.net)}
          detail={`Custos: ${formatMoney(receivedTotals.cost)}. Antes das despesas.`}
          tone="success"
          valueTone={receivedTotals.net < 0 ? 'danger' : undefined}
        />
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
        <Segmented<Tab>
          label="Mostrar"
          onChange={setTab}
          options={[
            { value: 'open', label: 'Em aberto', count: openCount },
            { value: 'done', label: 'Pagos e recebidos', count: doneCount },
          ]}
          value={tab}
        />
        <div className="grid gap-3 sm:flex sm:items-center">
          <FilterPills<Filter>
            label="Filtrar por direção"
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tudo' },
              { value: 'receive', label: 'Receber', icon: ArrowDownLeft },
              { value: 'pay', label: 'Pagar', icon: ArrowUpRight },
            ]}
            value={filter}
          />
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
                        details={[
                          receipt.code,
                          receipt.device,
                          `Custo ${formatMoney(receipt.cost || 0)} · Líquido ${formatMoney(receipt.value - (receipt.cost || 0))}`,
                        ]}
                        direction="receive"
                        key={`receipt-${receipt.id}`}
                        menu={
                          <RowMenu label={receipt.customer}>
                            {receipt.orderId && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link href={`/ordens?busca=${encodeURIComponent(receipt.code)}`}>
                                    Abrir OS
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
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
                  : 'Os pagamentos e recebimentos do período selecionado aparecem aqui, por mês.'
              }
            />
          )}
          <p className="text-center text-sm text-muted-foreground">
            Mostrando de {brDate(historySince)} a {brDate(historyUntil)}. O histórico completo fica
            no{' '}
            <Link
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="/pagamentos/historico"
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
    tone: 'success',
    amount: toneText.success,
    sign: '+',
  },
  pay: { icon: ArrowUpRight, label: 'Pagar', tone: 'danger', amount: '', sign: '−' },
} as const;

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
  const style = directionStyle[direction];
  return (
    <StatCard
      detail={lines.map((line) =>
        !line ? null : typeof line === 'string' ? (
          <p key={line}>{line}</p>
        ) : (
          <p className={cn('font-medium', toneText[line.tone])} key={line.text}>
            {line.text}
          </p>
        ),
      )}
      icon={style.icon}
      label={label}
      tone={style.tone}
      value={value}
    />
  );
}

function Group({
  receive,
  pay,
  ...props
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
    <ListGroup
      {...props}
      aside={
        <>
          {receive > 0 && (
            <span className={directionStyle.receive.amount}>+{formatMoney(receive)}</span>
          )}
          {pay > 0 && <span>−{formatMoney(pay)}</span>}
        </>
      }
    />
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
  return (
    <ListRow
      actions={
        <>
          {primary}
          {menu}
        </>
      }
      details={details.filter(Boolean).join(' · ') || undefined}
      leading={<IconChip icon={style.icon} tone={style.tone} />}
      note={note}
      noteTone={noteTone}
      srPrefix={`${style.label}: `}
      title={title}
      value={`${style.sign}${formatMoney(amount)}`}
      valueClassName={style.amount}
    />
  );
}
