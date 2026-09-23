import type { Order, Quote } from '@/lib/types';

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
