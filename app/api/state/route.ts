import { deleteRecord, getRecord, listRecords, saveRecord, transaction } from '@/lib/db';
import { currentAccount, sameOrigin } from '@/lib/auth';
import { getAccount } from '@/lib/repos/accounts';
import { clients, orders, repoFor, tableRepos, shops } from '@/lib/repos';
import { publicRecord, businessTypes } from '@/lib/public-data';
import { filmCatalog } from '@/lib/film-catalog';
import type { BusinessRecordType, DataObject, Order, StoredRecord } from '@/lib/types';
import { validateRecord } from '@/lib/validation';
import { notifyOrder } from '@/lib/whatsapp';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBusinessType = (value: string): value is BusinessRecordType =>
  businessTypes.includes(value);

/** Type of a record id such as 'order-…' or 'shop-main'. */
const typeOfId = (id: string) => businessTypes.find((type) => id.startsWith(`${type}-`));

const denied = () => Response.json({ error: 'Acesso negado' }, { status: 403 });

// Types not yet moved to their own table still live in `records`, scoped by `_accountId`.
const legacyOwner = (record: StoredRecord) => String(record.data._accountId || 'account-admin');
const isLegacyType = (type: string) => isBusinessType(type) && !repoFor(type);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = await currentAccount(request);
  const isPublic = url.searchParams.get('public') === '1';
  const id = url.searchParams.get('id');

  if (id) {
    if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const type = typeOfId(id);
    const repo = type && repoFor(type);
    const record = repo
      ? await repo.get(account.id, id)
      : await getRecord(id).then((found) =>
          found && isLegacyType(found.type) && legacyOwner(found) === account.id ? found : null,
        );
    return record ? Response.json({ record }) : denied();
  }

  const type = url.searchParams.get('type') || undefined;
  if (isPublic && (type === 'part' || type === 'shop')) {
    const owner = url.searchParams.get('account');
    const shopAccount = owner ? await getAccount(owner) : null;
    if (!owner || shopAccount?.status !== 'active')
      return Response.json({ error: 'Vitrine indisponível', records: [] }, { status: 404 });
    const records =
      type === 'shop'
        ? await shops.list(owner)
        : (await listRecords('part')).filter(
            (record) =>
              legacyOwner(record) === owner &&
              record.type === 'part' &&
              record.data.published === true &&
              Number(record.data.stock) > 0,
          );
    return Response.json({ records: records.map(publicRecord) });
  }

  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const repos = Object.entries(tableRepos)
    .filter(([repoType]) => !type || repoType === type)
    .map(([, repo]) => repo.list(account.id));
  const legacy =
    type && !isLegacyType(type)
      ? []
      : (await listRecords(type)).filter(
          (record) =>
            isLegacyType(record.type) &&
            !record.id.startsWith('film-default-') &&
            legacyOwner(record) === account.id,
        );
  const records = [...legacy, ...(await Promise.all(repos)).flat()];
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

  if (type === 'order') return saveOrder(account.id, id, validation.data as Order);

  const repo = repoFor(type);
  if (repo) {
    const record = await repo.save(account.id, id, validation.data);
    return record ? Response.json({ record }, { status: 201 }) : denied();
  }

  const existing = body.id ? await getRecord(body.id) : null;
  if (existing && (existing.type !== type || legacyOwner(existing) !== account.id)) return denied();
  const record = await saveRecord(id, type, { ...validation.data, _accountId: account.id });
  return Response.json({ record }, { status: 201 });
}

/** Saves the order and its client together, then notifies the customer on a new stage. */
async function saveOrder(accountId: string, id: string, order: Order) {
  const result = await transaction(async (run) => {
    const previous = await orders.get(accountId, id, run);
    const record = await orders.save(accountId, id, order, run);
    if (!record) return null;
    const clientId = await clients.upsertFromOrder(accountId, order, run);
    await orders.linkClient(id, clientId, run);
    return { previous, record, client: await clients.get(accountId, clientId, run) };
  });
  if (!result) return denied();

  let notification: unknown = null;
  if (!result.previous || result.previous.data.stage !== order.stage) {
    try {
      notification = await notifyOrder(
        accountId,
        id,
        order,
        result.previous ? 'status' : 'created',
      );
    } catch {
      notification = {
        status: 'failed',
        reason: 'OS salva, mas não foi possível registrar a notificação.',
      };
    }
  }
  const record = (await orders.get(accountId, id)) ?? result.record;
  return Response.json({ record, client: result.client, notification }, { status: 201 });
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
  if (id.startsWith('film-default-')) return denied();
  const type = typeOfId(id);
  const repo = type && repoFor(type);
  if (repo) return (await repo.remove(account.id, id)) ? Response.json({ ok: true }) : denied();
  const record = await getRecord(id);
  if (!record || !isLegacyType(record.type) || legacyOwner(record) !== account.id) return denied();
  await deleteRecord(id);
  return Response.json({ ok: true });
}
