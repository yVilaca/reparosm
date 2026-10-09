import { deliverLink, normalizeEmail, type Context } from '@/lib/access';
import { currentAccount, isOwner, normalizeUser, sameOrigin } from '@/lib/auth';
import { tenantTransaction, type Query } from '@/lib/db';
import { emailConfigured } from '@/lib/email';
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
import type { DataObject, SessionAccount, UserRole, UserStatus } from '@/lib/types';

/**
 * Equipe: o Dono cadastra e cuida do acesso das pessoas da loja. Ninguém define
 * senha de ninguém: a pessoa cria a dela pelo link (e-mail ou copiado).
 */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ROLES: readonly UserRole[] = ['owner', 'staff'];
const STATUSES: readonly UserStatus[] = ['active', 'disabled'];
const RESERVED = ['admin', 'adminreparosm'];

async function owner(request: Request): Promise<SessionAccount | Response> {
  const account = await currentAccount(request);
  if (!account) return json({ error: 'Não autenticado' }, 401);
  if (!isOwner(account)) return json({ error: 'Só o dono da loja cuida da equipe.' }, 403);
  return account;
}

const teamOf = async (run: Query, accountId: string) => ({
  users: await listUsers(run, accountId),
  requests: await listPasswordRequests(run, { role: 'staff', accountId }),
  emailEnabled: emailConfigured(),
});

export async function GET(request: Request) {
  const account = await owner(request);
  if (account instanceof Response) return account;
  return json(await tenantTransaction(account.id, (run) => teamOf(run, account.id)));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação inválida.' }, 403);
  const account = await owner(request);
  if (account instanceof Response) return account;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos' }, 400);
  }
  if (!isObject(body)) return json({ error: 'Dados inválidos' }, 400);
  const context: Context = (fn) => tenantTransaction(account.id, fn);
  const id = String(body.id || '');
  const self = id === account.user.id;
  const name =
    body.name === undefined
      ? undefined
      : String(body.name || '')
          .trim()
          .slice(0, 80);
  if (name !== undefined && name.length < 2) return json({ error: 'Informe o nome.' }, 400);
  const typedEmail = String(body.email ?? '').trim();
  const email = typedEmail ? normalizeEmail(typedEmail) : null;
  if (typedEmail && !email) return json({ error: 'Informe um e-mail válido.' }, 400);

  try {
    if (body.action === 'create') {
      const username = normalizeUser(String(body.username || '')).slice(0, 40);
      if (username.length < 3)
        return json({ error: 'Use um usuário com pelo menos 3 letras ou números.' }, 400);
      if (RESERVED.includes(username)) return json({ error: 'Este usuário já existe.' }, 409);
      if (!name) return json({ error: 'Informe o nome.' }, 400);
      const role = ROLES.includes(body.role as UserRole) ? (body.role as UserRole) : 'staff';
      const user = await context((run) =>
        createUser(run, account.id, { username, name, role, email: email ?? undefined }),
      );
      const target = await context((run) =>
        linkTarget(run, { userId: user.id, accountId: account.id }),
      );
      const invite = target ? await deliverLink(context, target, { send: true }) : null;
      return json({ user, invite }, 201);
    }

    if (body.action === 'update') {
      const role = ROLES.includes(body.role as UserRole) ? (body.role as UserRole) : undefined;
      const status = STATUSES.includes(body.status as UserStatus)
        ? (body.status as UserStatus)
        : undefined;
      if (self && status === 'disabled')
        return json({ error: 'Você não pode desativar o próprio acesso.' }, 400);
      const user = await context((run) => updateUser(run, account.id, id, { name, role, status }));
      return user ? json({ user }) : json({ error: 'Pessoa não encontrada.' }, 404);
    }

    if (body.action === 'set-email') {
      if (self) return json({ error: 'Troque o seu e-mail em Minha conta.' }, 400);
      const user = await context((run) => setUserEmail(run, account.id, id, email));
      return user ? json({ user }) : json({ error: 'Pessoa não encontrada.' }, 404);
    }

    if (body.action === 'send-link' || body.action === 'copy-link') {
      if (self) return json({ error: 'Para a sua senha, use Minha conta.' }, 400);
      const target = await context((run) => linkTarget(run, { userId: id, accountId: account.id }));
      if (!target) return json({ error: 'Pessoa não encontrada ou sem acesso.' }, 404);
      if (body.action === 'send-link' && !target.email)
        return json({ error: 'Cadastre o e-mail da pessoa ou copie o link.' }, 400);
      const invite = await deliverLink(context, target, { send: body.action === 'send-link' });
      return json({ invite });
    }

    if (body.action === 'disconnect') {
      if (self) return json({ error: 'Use "Sair dos outros aparelhos" em Minha conta.' }, 400);
      const ended = await context((run) => endUserSessions(run, account.id, id));
      return json({ ended });
    }
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
  return json({ error: 'Ação inválida.' }, 400);
}
