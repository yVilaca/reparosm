import { timingSafeEqual } from 'node:crypto';
import { normalizeEmail, openStore } from '@/lib/access';
import { ensureAdmin } from '@/lib/auth';
import type { AdminActor } from '@/lib/db';
import { env } from '@/lib/env';
import { storeByExternalRef } from '@/lib/repos/accounts';
import type { DataObject } from '@/lib/types';

/**
 * Criação de loja depois de uma compra, chamada pelo servidor da integração de
 * pagamento (ou por automação como Make/Zapier), nunca pelo navegador:
 *
 *   POST /api/provisioning/stores
 *   Authorization: Bearer <PROVISIONING_TOKEN>
 *   { "externalId": "pedido-123", "storeName": "Cell Prime", "ownerName": "Marcos",
 *     "ownerEmail": "marcos@exemplo.com", "plan": "Mensal", "dueDate": "2026-11-10" }
 *
 * Cria a loja e o Dono e manda o convite para o e-mail dele. O mesmo
 * `externalId` nunca cria duas lojas: a repetição devolve a que já existe.
 * Sem PROVISIONING_TOKEN configurado, a rota não existe (404).
 */

const PLANS = ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 80) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

const digest = async (value: string) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

/** Compara a chave em tempo constante (os digests têm sempre o mesmo tamanho). */
async function authorized(request: Request) {
  const expected = env.provisioningToken;
  const header = request.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!expected || !given) return false;
  return timingSafeEqual(await digest(given), await digest(expected));
}

// A integração age como o administrador do ReparoSM.
const SYSTEM: AdminActor = { id: 'account-admin', role: 'admin' };

const existing = (store: { id: string; username: string; ownerUsername: string }) =>
  json({ created: false, accountId: store.id, username: store.ownerUsername || store.username });

export async function POST(request: Request) {
  if (!env.provisioningToken) return json({ error: 'Não encontrado' }, 404);
  if (!(await authorized(request))) return json({ error: 'Não autorizado' }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  if (!isObject(body)) return json({ error: 'JSON inválido' }, 400);
  const externalId = text(body.externalId, 120);
  const storeName = text(body.storeName);
  const ownerName = text(body.ownerName);
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const problems = [
    !externalId && 'externalId',
    storeName.length < 2 && 'storeName',
    ownerName.length < 2 && 'ownerName',
    !ownerEmail && 'ownerEmail',
  ].filter(Boolean);
  if (problems.length) return json({ error: 'Campos inválidos', fields: problems }, 400);
  const plan = PLANS.includes(body.plan as (typeof PLANS)[number])
    ? (body.plan as (typeof PLANS)[number])
    : 'Mensal';
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(text(body.dueDate, 10)) ? text(body.dueDate, 10) : '';

  await ensureAdmin();
  const already = await storeByExternalRef(SYSTEM, externalId);
  if (already) return existing(already);
  try {
    const created = await openStore(SYSTEM, {
      name: storeName,
      ownerName,
      ownerEmail: ownerEmail as string,
      plan,
      dueDate,
      externalRef: externalId,
    });
    return json(
      {
        created: true,
        accountId: created.account.id,
        username: created.account.username,
        // Sem e-mail enviado, o link volta aqui para a integração entregar de outro jeito.
        invite: created.invite,
      },
      201,
    );
  } catch (error) {
    const database = error as { code?: string; constraint?: string };
    if (database.code === '23505') {
      // Dois avisos da mesma compra ao mesmo tempo: o outro criou primeiro.
      const store = await storeByExternalRef(SYSTEM, externalId);
      if (store) return existing(store);
      if (database.constraint === 'users_email_key')
        return json({ error: 'Este e-mail já tem acesso a outra loja.' }, 409);
    }
    throw error;
  }
}
