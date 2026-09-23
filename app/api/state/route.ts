import { deleteRecord, getRecord, listRecords, saveRecord } from '@/lib/db';
import { currentAccount, sameOrigin } from '@/lib/auth';
import { getAccount } from '@/lib/repos/accounts';
import { publicRecord, businessTypes } from '@/lib/public-data';
import { filmCatalog } from '@/lib/film-catalog';
import { clientFromOrder, findMatchingClient } from '@/lib/orders';
import type { BusinessRecordType, DataObject, Order, StoredRecord } from '@/lib/types';
import { validateRecord } from '@/lib/validation';
import { notifyOrder } from '@/lib/whatsapp';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBusinessType = (value: string): value is BusinessRecordType =>
  businessTypes.includes(value);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = await currentAccount(request);
  const isPublic = url.searchParams.get('public') === '1';
  const id = url.searchParams.get('id');

  if (id) {
    const record = await getRecord(id);
    if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const owner = String(record?.data._accountId || 'account-admin');
    return record && isBusinessType(record.type) && owner === account.id
      ? Response.json({ record })
      : Response.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const type = url.searchParams.get('type') || undefined;
  if (isPublic && (type === 'part' || type === 'shop')) {
    const owner = url.searchParams.get('account');
    const shopAccount = owner ? await getAccount(owner) : null;
    if (shopAccount?.status !== 'active')
      return Response.json({ error: 'Vitrine indisponível', records: [] }, { status: 404 });
    const records = (await listRecords(type)).filter(
      (record) =>
        String(record.data._accountId || 'account-admin') === owner &&
        (type !== 'part' ||
          (record.type === 'part' &&
            record.data.published === true &&
            Number(record.data.stock) > 0)),
    );
    return Response.json({ records: records.map(publicRecord) });
  }

  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const records = (await listRecords(type)).filter(
    (record) =>
      isBusinessType(record.type) &&
      !record.id.startsWith('film-default-') &&
      String(record.data._accountId || 'account-admin') === account.id,
  );
  return Response.json({ records: [...records, ...(!type || type === 'film' ? filmCatalog : [])] });
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
  if (!isObject(body) || typeof body.type !== 'string' || !isBusinessType(body.type))
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });

  const type = body.type;
  const validation = validateRecord(type, body.data);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
  if (typeof body.id !== 'undefined' && typeof body.id !== 'string')
    return Response.json({ error: 'Identificador inválido' }, { status: 400 });
  if (body.id?.startsWith('film-default-'))
    return Response.json({ error: 'Catálogo compartilhado somente para leitura' }, { status: 403 });

  const id = body.id || `${type}-${crypto.randomUUID()}`;
  if (!id.startsWith(`${type}-`))
    return Response.json({ error: 'Identificador inválido para este cadastro' }, { status: 400 });

  const existing = body.id ? await getRecord(body.id) : null;
  if (
    existing &&
    (!isBusinessType(existing.type) ||
      existing.type !== type ||
      String(existing.data._accountId || 'account-admin') !== account.id)
  )
    return Response.json({ error: 'Acesso negado' }, { status: 403 });

  const data = { ...validation.data, _accountId: account.id };
  const record = await saveRecord(id, type, data);
  let client: StoredRecord<'client'> | null = null;

  if (type === 'order') {
    const order = data as Order;
    const clients = await listRecords('client');
    const existingClient = findMatchingClient(clients, order, account.id);
    const clientId = existingClient?.id || `client-${crypto.randomUUID()}`;
    const clientData = clientFromOrder(
      order,
      account.id,
      id,
      existingClient,
      new Date().toISOString(),
    );
    client = await saveRecord(clientId, 'client', clientData);
  }

  let notification: unknown = null;
  const existingOrder = existing?.type === 'order' ? existing : null;
  if (type === 'order' && (!existingOrder || existingOrder.data.stage !== (data as Order).stage)) {
    try {
      notification = await notifyOrder(
        account.id,
        id,
        data as Order,
        existingOrder ? 'status' : 'created',
      );
    } catch {
      notification = {
        status: 'failed',
        reason: 'OS salva, mas não foi possível registrar a notificação.',
      };
    }
  }
  return Response.json({ record, client, notification }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  if (new URL(request.url).searchParams.get('all') === 'true') {
    return Response.json(
      { error: 'Limpeza total desativada em contas multiempresa' },
      { status: 403 },
    );
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
  const record = await getRecord(id);
  if (
    !record ||
    !isBusinessType(record.type) ||
    id.startsWith('film-default-') ||
    String(record.data._accountId || 'account-admin') !== account.id
  )
    return Response.json({ error: 'Acesso negado' }, { status: 403 });
  await deleteRecord(id);
  return Response.json({ ok: true });
}
