import { currentAccount, isOwner, sameOrigin } from '@/lib/auth';
import { repoFor, type TableRepo } from '@/lib/repos';
import type { BusinessRecordType, DataObject, RecordData } from '@/lib/types';
import { validateRecord } from '@/lib/validation';

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const denied = () => Response.json({ error: 'Acesso negado' }, { status: 403 });

/** `ownerWrites`: só o Dono grava e exclui (ex.: dados da assistência). */
export function resourceRoute<T extends BusinessRecordType>(
  type: T,
  { ownerWrites = false }: { ownerWrites?: boolean } = {},
) {
  const repo = repoFor(type) as TableRepo<T>;
  const prefix = `${type}-`;

  return {
    async GET(request: Request) {
      const account = await currentAccount(request);
      if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      const id = new URL(request.url).searchParams.get('id');
      if (id) {
        if (!id.startsWith(prefix)) return denied();
        const record = await repo.get(account.id, id);
        return record ? Response.json({ record }) : denied();
      }
      return Response.json({ records: await repo.list(account.id) });
    },

    async POST(request: Request) {
      if (!sameOrigin(request))
        return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
      const account = await currentAccount(request);
      if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      if (ownerWrites && !isOwner(account)) return denied();
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Dados inválidos' }, { status: 400 });
      }
      if (!isObject(body)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
      const validation = validateRecord(type, body.data);
      if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
      if (typeof body.id !== 'undefined' && typeof body.id !== 'string')
        return Response.json({ error: 'Identificador inválido' }, { status: 400 });
      const id = body.id || `${type}-${crypto.randomUUID()}`;
      if (!id.startsWith(prefix))
        return Response.json(
          { error: 'Identificador inválido para este cadastro' },
          { status: 400 },
        );
      try {
        const record = await repo.save(account.id, id, validation.data as RecordData[T]);
        return record ? Response.json({ record }, { status: 201 }) : denied();
      } catch (error) {
        const databaseError = error as { code?: string; constraint?: string };
        if (type === 'part' && databaseError.code === '23514')
          return Response.json(
            {
              error:
                'Estoque negativo não permitido. Revise a quantidade e a preferência da assistência.',
            },
            { status: 409 },
          );
        if (
          type === 'client' &&
          databaseError.code === '23505' &&
          databaseError.constraint === 'clients_account_phone_digits_unique'
        ) {
          return Response.json(
            { error: 'Já existe um cliente com este telefone nesta loja.' },
            { status: 409 },
          );
        }
        throw error;
      }
    },

    async DELETE(request: Request) {
      if (!sameOrigin(request))
        return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
      const account = await currentAccount(request);
      if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      if (ownerWrites && !isOwner(account)) return denied();
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
      if (!id.startsWith(prefix)) return denied();
      return (await repo.remove(account.id, id)) ? Response.json({ ok: true }) : denied();
    },
  };
}
