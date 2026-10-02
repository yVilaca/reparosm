import { currentAccount, sameOrigin } from '@/lib/auth';
import { tenantTransaction } from '@/lib/db';
import * as payables from '@/lib/repos/payables';
import type { DataObject, Payable } from '@/lib/types';

const denied = () => Response.json({ error: 'Acesso negado' }, { status: 403 });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parse(data: unknown): Payable | null {
  if (!isObject(data) || typeof data.description !== 'string' || !data.description.trim())
    return null;
  const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const dueDate = data.dueDate;
  if (
    dueDate !== undefined &&
    dueDate !== '' &&
    (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
  )
    return null;
  const status = data.status === 'paid' ? 'paid' : 'pending';
  const source = data.source === 'purchase' || data.source === 'fixed' ? data.source : 'other';
  return {
    description: data.description.trim(),
    supplier: typeof data.supplier === 'string' ? data.supplier.trim() : undefined,
    category: typeof data.category === 'string' ? data.category.trim() : undefined,
    source,
    amount,
    dueDate: dueDate || undefined,
    status,
    paidAt: typeof data.paidAt === 'string' ? data.paidAt : undefined,
    method: typeof data.method === 'string' ? data.method.trim() : undefined,
    notes: typeof data.notes === 'string' ? data.notes.trim() : undefined,
  };
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (!isObject(body)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  const data = parse(body.data);
  if (!data) return Response.json({ error: 'Conta a pagar inválida.' }, { status: 400 });
  const id = typeof body.id === 'string' ? body.id : `payable-${crypto.randomUUID()}`;
  if (!id.startsWith('payable-'))
    return Response.json({ error: 'Identificador inválido' }, { status: 400 });
  try {
    const record = await tenantTransaction(account.id, (run) =>
      payables.save(account.id, id, data, run),
    );
    return record ? Response.json({ record }, { status: 201 }) : denied();
  } catch (error) {
    if (error instanceof payables.PayableError)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (!isObject(body) || typeof body.id !== 'string' || typeof body.method !== 'string')
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  const record = await tenantTransaction(account.id, (run) =>
    payables.markPaid(account.id, body.id as string, body.method as string, run),
  );
  return record ? Response.json({ record }) : denied();
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !id.startsWith('payable-'))
    return Response.json({ error: 'ID inválido' }, { status: 400 });
  return (await payables.remove(account.id, id)) ? Response.json({ ok: true }) : denied();
}
