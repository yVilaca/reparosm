import { deliverLink, normalizeEmail, openStore, type Context } from '@/lib/access';
import { currentAccount, normalizeUser, sameOrigin } from '@/lib/auth';
import { adminTransaction, type AdminActor } from '@/lib/db';
import { emailConfigured } from '@/lib/email';
import {
  deleteAccount,
  getAccountAsAdmin,
  getStoreAsAdmin,
  listStores,
  renewAccount,
  updateAccountProfile,
} from '@/lib/repos/accounts';
import { revokeSessionsAsAdmin } from '@/lib/repos/sessions';
import {
  createUser,
  endUserSessions,
  linkTarget,
  listPasswordRequests,
  listUsers,
  setUserEmail,
  TeamRuleError,
  updateUser,
} from '@/lib/repos/users';
import type { DataObject, UserRole, UserStatus } from '@/lib/types';

/**
 * Lojas: o administrador do ReparoSM cuida das assinaturas e do acesso de cada
 * loja. Ninguém define senha de ninguém: o dono e a equipe entram por link.
 */

const PLANS = ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const;
const STATUSES = ['active', 'suspended', 'cancelled'] as const;
const USER_ROLES: readonly UserRole[] = ['owner', 'staff'];
const USER_STATUSES: readonly UserStatus[] = ['active', 'disabled'];
const RESERVED = ['admin', 'adminreparosm'];

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const admin = async (request: Request): Promise<AdminActor | null> => {
  const a = await currentAccount(request);
  return a?.role === 'admin' ? { id: a.id, role: 'admin' } : null;
};
const denied = () => json({ error: 'Acesso negado' }, 403);
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);
const text = (value: unknown, max = 80) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

export async function GET(request: Request) {
  const actor = await admin(request);
  if (!actor) return denied();
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const store = await getStoreAsAdmin(actor, id);
    if (!store) return json({ error: 'Loja não encontrada' }, 404);
    const users = await adminTransaction(actor, (run) => listUsers(run, id));
    return json({ store, users, emailEnabled: emailConfigured() });
  }
  const [stores, requests] = await Promise.all([
    listStores(actor),
    adminTransaction(actor, (run) => listPasswordRequests(run, { role: 'owner' })),
  ]);
  return json({ stores, requests, emailEnabled: emailConfigured() });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return denied();
  const actor = await admin(request);
  if (!actor) return denied();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos' }, 400);
  }
  if (!isObject(body)) return json({ error: 'Dados inválidos' }, 400);
  try {
    return await handle(actor, body);
  } catch (error) {
    if (error instanceof TeamRuleError) return json({ error: error.message }, 400);
    const database = error as { code?: string; constraint?: string };
    if (database.code === '23505')
      return json(
        {
          error:
            database.constraint === 'users_email_key'
              ? 'Este e-mail já está em uso no ReparoSM.'
              : 'Este usuário já existe. Escolha outro.',
        },
        409,
      );
    throw error;
  }
}

async function handle(actor: AdminActor, body: DataObject) {
  const context: Context = (fn) => adminTransaction(actor, fn);
  const typedEmail = text(body.email ?? body.ownerEmail, 254);
  const email = typedEmail ? normalizeEmail(typedEmail) : null;
  if (typedEmail && !email) return json({ error: 'Informe um e-mail válido.' }, 400);

  // Link para alguém de qualquer loja (pedido de senha de um dono, por exemplo).
  if (body.action === 'send-link' || body.action === 'copy-link') {
    // Copiar e entregar o link à mão exige saber que é a pessoa mesmo.
    if (body.action === 'copy-link' && body.identityConfirmed !== true)
      return json({ error: 'Confirme a identidade da pessoa antes de gerar o link.' }, 400);
    const target = await context((run) => linkTarget(run, { userId: String(body.userId || '') }));
    if (!target) return json({ error: 'Pessoa não encontrada, sem acesso ou protegida.' }, 404);
    if (body.action === 'send-link' && !target.email)
      return json({ error: 'Cadastre o e-mail da pessoa ou copie o link.' }, 400);
    return json({
      invite: await deliverLink(context, target, { send: body.action === 'send-link' }),
    });
  }

  // Daqui em diante, sempre sobre uma loja (nunca a conta do administrador).
  const storeId = String(body.id || '');
  const store = storeId ? await getAccountAsAdmin(actor, storeId) : null;
  if (storeId && (!store || store.role === 'admin'))
    return json({ error: 'Loja não encontrada ou protegida' }, 400);

  if (store && body.action === 'renew') {
    const renewed = await renewAccount(actor, store.id);
    return renewed
      ? json({ account: renewed })
      : json({ error: 'Plano Cortesia não tem vencimento para renovar.' }, 400);
  }

  if (store && body.action === 'add-user') {
    const username = normalizeUser(String(body.username || '')).slice(0, 40);
    if (username.length < 3 || RESERVED.includes(username))
      return json({ error: 'Use um usuário com pelo menos 3 letras ou números.' }, 400);
    const name = text(body.name);
    if (name.length < 2) return json({ error: 'Informe o nome.' }, 400);
    const role = isOneOf(body.role, USER_ROLES) ? body.role : 'staff';
    const user = await context((run) =>
      createUser(run, store.id, { username, name, role, email: email ?? undefined }),
    );
    const target = await context((run) => linkTarget(run, { userId: user.id }));
    const invite = target ? await deliverLink(context, target, { send: true }) : null;
    return json({ user, invite }, 201);
  }

  if (store && body.action === 'set-email') {
    const user = await context((run) =>
      setUserEmail(run, store.id, String(body.userId || ''), email),
    );
    return user ? json({ user }) : json({ error: 'Usuário não encontrado.' }, 404);
  }

  if (store && body.action === 'disconnect-user') {
    const ended = await context((run) => endUserSessions(run, store.id, String(body.userId || '')));
    return json({ ended });
  }

  if (store && body.action === 'update-user') {
    const name = body.name === undefined ? undefined : text(body.name);
    if (name !== undefined && name.length < 2) return json({ error: 'Informe o nome.' }, 400);
    const user = await context((run) =>
      updateUser(run, store.id, String(body.userId || ''), {
        name,
        role: isOneOf(body.role, USER_ROLES) ? body.role : undefined,
        status: isOneOf(body.status, USER_STATUSES) ? body.status : undefined,
      }),
    );
    return user ? json({ user }) : json({ error: 'Usuário não encontrado.' }, 404);
  }

  if (store) {
    const status = isOneOf(body.status, STATUSES) ? body.status : store.status;
    const updated = await updateAccountProfile(actor, store.id, {
      name: text(body.name ?? store.name) || store.name,
      status,
      plan: isOneOf(body.plan, PLANS) ? body.plan : store.plan,
      dueDate: String(body.dueDate ?? store.dueDate ?? '').slice(0, 10),
    });
    if (status !== 'active') await revokeSessionsAsAdmin(actor, store.id);
    return json({ account: updated });
  }

  // Loja nova: o dono recebe o convite para criar a senha (ou o link volta para copiar).
  if (!email) return json({ error: 'Informe o e-mail do dono da loja.' }, 400);
  const typedUsername = normalizeUser(String(body.username || '')).slice(0, 40);
  if (typedUsername && typedUsername.length < 3)
    return json({ error: 'Use um usuário com pelo menos 3 caracteres' }, 400);
  if (RESERVED.includes(typedUsername)) return json({ error: 'Este usuário já existe' }, 409);
  const name = text(body.name);
  if (name.length < 2) return json({ error: 'Informe o nome da loja.' }, 400);
  const created = await openStore(actor, {
    name,
    ownerName: text(body.ownerName) || name,
    ownerEmail: email,
    username: typedUsername || undefined,
    plan: isOneOf(body.plan, PLANS) ? body.plan : 'Mensal',
    dueDate: String(body.dueDate || '').slice(0, 10),
  });
  return json(created, 201);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return denied();
  const actor = await admin(request);
  if (!actor) return denied();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === 'account-admin')
    return json({ error: 'Esta conta não pode ser excluída' }, 400);
  if (!(await getAccountAsAdmin(actor, id))) return json({ error: 'Conta não encontrada' }, 404);
  // Every table references accounts with ON DELETE CASCADE.
  await deleteAccount(actor, id);
  return json({ ok: true });
}
