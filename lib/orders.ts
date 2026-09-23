import { normalizePhone } from './format.ts';
import type { Client, Order, Quote, StoredRecord } from '@/lib/types';

const normalizedName = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR');
const ownerOf = (record: StoredRecord) => String(record.data._accountId || 'account-admin');

export function findMatchingClient(
  clients: ReadonlyArray<StoredRecord>,
  order: Pick<Order, 'customer' | 'phone'>,
  accountId: string,
): StoredRecord<'client'> | undefined {
  const scoped = clients.filter(
    (record): record is StoredRecord<'client'> =>
      record.type === 'client' && ownerOf(record) === accountId,
  );
  const phone = normalizePhone(order.phone);
  if (phone.length >= 10) {
    const byPhone = scoped.find((record) => normalizePhone(record.data.phone) === phone);
    if (byPhone) return byPhone;
  }
  const name = normalizedName(order.customer);
  return scoped.find((record) => normalizedName(record.data.name) === name);
}

export function clientFromOrder(
  order: Order,
  accountId: string,
  orderId: string,
  existing: StoredRecord<'client'> | undefined,
  now: string,
): Client {
  return {
    ...(existing?.data || {}),
    name: order.customer.trim(),
    phone: order.phone || existing?.data.phone || '',
    status: order.status === 'Concluído' ? 'Concluído' : 'Em atendimento',
    lastOrderId: orderId,
    lastOrderCode: order.code,
    lastDevice: order.device,
    updatedAt: now,
    createdAt: existing?.data.createdAt || now,
    automatic: existing?.data.automatic ?? true,
    _accountId: accountId,
  };
}

export function orderFromQuote(
  quote: Quote,
  quoteId: string,
  accountId: string,
  answeredAt: string,
): Order {
  const labor = Number(quote.labor || 0);
  const parts = Number(quote.parts || 0);
  const total = Number(quote.total ?? labor + parts);
  return {
    code: `OS-${String(quote.code || answeredAt)
      .replace(/\D/g, '')
      .slice(-5)}`,
    customer: quote.customer,
    phone: quote.phone,
    device: quote.device,
    problem: quote.problem,
    service: quote.service,
    notes: quote.notes,
    labor,
    parts,
    cost: 0,
    total,
    profit: total,
    stage: 'Recebido',
    status: 'Aberto',
    priority: 'Normal',
    quoteId,
    quoteCode: quote.code,
    _accountId: accountId,
    createdAt: answeredAt,
  };
}
