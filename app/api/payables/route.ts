import { currentAccount, sameOrigin } from '@/lib/auth';
import { tenantTransaction } from '@/lib/db';
import { isPayableDate, isPayableRecurrence, nextPayableDueDate } from '@/lib/payable-recurrence';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, splitInstallments } from '@/lib/payable-schedule';
import { isPaymentMethod } from '@/lib/payment-methods';
import * as payables from '@/lib/repos/payables';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { DataObject, Payable } from '@/lib/types';

const denied = () => Response.json({ error: 'Acesso negado' }, { status: 403 });
const invalid = (error: string) => Response.json({ error }, { status: 400 });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
// numeric(12, 2): acima disso o banco recusaria com erro genérico.
const MAX_AMOUNT = 9_999_999_999.99;

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const toAmount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT
    ? Math.round(amount * 100) / 100
    : null;
};

type Parsed = { ok: true; data: Payable; installments?: number } | { ok: false; error: string };

function parse(raw: unknown): Parsed {
  if (!isObject(raw)) return { ok: false, error: 'Conta a pagar inválida.' };
  const description = text(raw.description, 200);
  if (!description) return { ok: false, error: 'Informe a descrição da conta.' };
  const amount = toAmount(raw.amount);
  if (amount === null) return { ok: false, error: 'Informe um valor maior que zero.' };
  const dueDate = raw.dueDate === '' || raw.dueDate === undefined ? undefined : raw.dueDate;
  if (dueDate !== undefined && !isPayableDate(dueDate))
    return { ok: false, error: 'Data de vencimento inválida.' };
  const source = raw.source === 'purchase' || raw.source === 'fixed' ? raw.source : 'other';
  const recurrence = raw.recurrence;
  if (recurrence !== undefined) {
    if (!isPayableRecurrence(recurrence)) return { ok: false, error: 'Repetição inválida.' };
    if (source === 'purchase')
      return { ok: false, error: 'Compras não se repetem. Use parcelas para compras a prazo.' };
    if (!dueDate || !nextPayableDueDate(dueDate, recurrence))
      return { ok: false, error: 'Conta repetida precisa de um vencimento válido.' };
  }
  let installments: number | undefined;
  if (raw.installments !== undefined) {
    installments = Number(raw.installments);
    if (
      !Number.isInteger(installments) ||
      installments < MIN_INSTALLMENTS ||
      installments > MAX_INSTALLMENTS
    )
      return {
        ok: false,
        error: `Parcele em ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} vezes.`,
      };
    if (recurrence) return { ok: false, error: 'Escolha parcelar ou repetir, não os dois.' };
    if (!dueDate) return { ok: false, error: 'Informe o vencimento da primeira parcela.' };
    if (!splitInstallments(amount, installments))
      return { ok: false, error: 'O valor é pequeno demais para tantas parcelas.' };
  }
  return {
    ok: true,
    installments,
    data: {
      description,
      supplier: text(raw.supplier, 120),
      category: text(raw.category, 80),
      source,
      recurrence,
      paymentCode: text(raw.paymentCode, 300),
      amount,
      dueDate,
      notes: text(raw.notes, 1000),
    },
  };
}

async function body(request: Request) {
  try {
    const value: unknown = await request.json();
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function conflict(error: unknown) {
  if (error instanceof payables.PayableError)
    return Response.json({ error: error.message }, { status: 409 });
  throw error;
}

export async function GET(request: Request) {
  const account = await currentAccount(request);
  return account
    ? Response.json({ records: await payables.list(account.id) })
    : Response.json({ error: 'Não autenticado' }, { status: 401 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const input = await body(request);
  if (!input) return invalid('Dados inválidos');
  const parsed = parse(input.data);
  if (!parsed.ok) return invalid(parsed.error);
  try {
    if (typeof input.id === 'string') {
      if (!input.id.startsWith('payable-')) return invalid('Identificador inválido');
      const record = await tenantTransaction(account.id, (run) =>
        payables.update(account.id, input.id as string, parsed.data, run),
      );
      return record ? Response.json({ record, records: [record] }, { status: 201 }) : denied();
    }
    const records = await tenantTransaction(account.id, (run) =>
      payables.create(account.id, parsed.data, parsed.installments, run),
    );
    return Response.json({ record: records[0], records }, { status: 201 });
  } catch (error) {
    return conflict(error);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const input = await body(request);
  if (!input || typeof input.id !== 'string' || !input.id.startsWith('payable-'))
    return invalid('Dados inválidos');
  const id = input.id;
  try {
    if (input.action === 'undo') {
      const result = await tenantTransaction(account.id, (run) =>
        payables.undo(account.id, id, run),
      );
      return result ? Response.json(result) : denied();
    }
    if (input.action !== undefined && input.action !== 'pay') return invalid('Ação inválida.');
    if (!isPaymentMethod(input.method)) return invalid('Escolha a forma de pagamento.');
    const method = input.method;
    let amount: number | undefined;
    if (input.amount !== undefined) {
      const parsed = toAmount(input.amount);
      if (parsed === null) return invalid('Informe o valor pago, maior que zero.');
      amount = parsed;
    }
    let paidOn: string | undefined;
    if (input.paidOn !== undefined) {
      if (!isPayableDate(input.paidOn)) return invalid('Data de pagamento inválida.');
      if (input.paidOn > todayInSaoPaulo())
        return invalid('A data de pagamento não pode ser no futuro.');
      paidOn = input.paidOn;
    }
    const result = await tenantTransaction(account.id, (run) =>
      payables.pay(account.id, id, { method, amount, paidOn }, run),
    );
    return result ? Response.json(result) : denied();
  } catch (error) {
    return conflict(error);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !id.startsWith('payable-')) return invalid('ID inválido');
  return (await payables.remove(account.id, id)) ? Response.json({ ok: true }) : denied();
}
