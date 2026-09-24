import { currentAccount, sameOrigin } from '@/lib/auth';
import { getAccount } from '@/lib/repos/accounts';
import { parts, repoFor, tableRepos, shops } from '@/lib/repos';
import { publicRecord, businessTypes } from '@/lib/public-data';
import { filmCatalog } from '@/lib/film-catalog';
import type { BusinessRecordType, DataObject, Order } from '@/lib/types';
import { validateRecord } from '@/lib/validation';
import { saveOrder } from '@/lib/orders';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBusinessType = (value: string): value is BusinessRecordType =>
  businessTypes.includes(value);

/** Repository for a record id such as 'order-…' or 'shop-main'. */
const repoForId = (id: string) => {
  const type = businessTypes.find((type) => id.startsWith(`${type}-`));
  return type ? repoFor(type) : undefined;
};

const denied = () => Response.json({ error: 'Acesso negado' }, { status: 403 });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = await currentAccount(request);
  const isPublic = url.searchParams.get('public') === '1';
  const id = url.searchParams.get('id');

  if (id) {
    if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const record = await repoForId(id)?.get(account.id, id);
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
        : (await parts.list(owner)).filter(
            (record) => record.data.published === true && Number(record.data.stock) > 0,
          );
    return Response.json({ records: records.map(publicRecord) });
  }

  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const lists = Object.entries(tableRepos)
    .filter(([repoType]) => !type || repoType === type)
    .map(([, repo]) => repo.list(account.id));
  const records = (await Promise.all(lists)).flat();
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

  if (type === 'order') {
    const result = await saveOrder(account.id, id, validation.data as Order);
    return result ? Response.json(result, { status: 201 }) : denied();
  }
  const record = await repoFor(type)?.save(account.id, id, validation.data);
  return record ? Response.json({ record }, { status: 201 }) : denied();
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
  const removed = await repoForId(id)?.remove(account.id, id);
  return removed ? Response.json({ ok: true }) : denied();
}
