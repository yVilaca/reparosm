import {
  currentAccount,
  isOwner,
  normalizeUser,
  passwordHash,
  passwordProblem,
  sameOrigin,
} from '@/lib/auth';
import { tenantTransaction, type Query } from '@/lib/db';
import {
  createUser,
  endUserSessions,
  listPasswordRequests,
  listUsers,
  setUserPassword,
  TeamRuleError,
  updateUser,
} from '@/lib/repos/users';
import type { DataObject, SessionAccount, UserRole, UserStatus } from '@/lib/types';

/** Equipe: o Dono cadastra e cuida do acesso das pessoas da loja. */

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
  const id = String(body.id || '');
  const self = id === account.user.id;
  const name =
    body.name === undefined
      ? undefined
      : String(body.name || '')
          .trim()
          .slice(0, 80);
  if (name !== undefined && name.length < 2) return json({ error: 'Informe o nome.' }, 400);

  try {
    if (body.action === 'create') {
      const username = normalizeUser(String(body.username || '')).slice(0, 40);
      if (username.length < 3)
        return json({ error: 'Use um usuário com pelo menos 3 letras ou números.' }, 400);
      if (RESERVED.includes(username)) return json({ error: 'Este usuário já existe.' }, 409);
      if (!name) return json({ error: 'Informe o nome.' }, 400);
      const problem = passwordProblem(String(body.password || ''));
      if (problem) return json({ error: problem }, 400);
      const role = ROLES.includes(body.role as UserRole) ? (body.role as UserRole) : 'staff';
      const hash = await passwordHash(username, String(body.password));
      const user = await tenantTransaction(account.id, (run) =>
        createUser(run, account.id, { username, name, role, passwordHash: hash }),
      );
      return json({ user }, 201);
    }

    if (body.action === 'update') {
      const role = ROLES.includes(body.role as UserRole) ? (body.role as UserRole) : undefined;
      const status = STATUSES.includes(body.status as UserStatus)
        ? (body.status as UserStatus)
        : undefined;
      if (self && status === 'disabled')
        return json({ error: 'Você não pode desativar o próprio acesso.' }, 400);
      const user = await tenantTransaction(account.id, (run) =>
        updateUser(run, account.id, id, { name, role, status }),
      );
      return user ? json({ user }) : json({ error: 'Pessoa não encontrada.' }, 404);
    }

    if (body.action === 'reset-password') {
      if (self) return json({ error: 'Troque a sua senha em Minha conta.' }, 400);
      const problem = passwordProblem(String(body.password || ''));
      if (problem) return json({ error: problem }, 400);
      const done = await tenantTransaction(account.id, async (run) => {
        const [user] = await run<{ username: string }>(
          'SELECT username FROM users WHERE id = $1 AND account_id = $2',
          [id, account.id],
        );
        if (!user) return false;
        const hash = await passwordHash(user.username, String(body.password));
        return setUserPassword(run, account.id, id, hash);
      });
      return done ? json({ ok: true }) : json({ error: 'Pessoa não encontrada.' }, 404);
    }

    if (body.action === 'disconnect') {
      if (self) return json({ error: 'Use "Sair dos outros aparelhos" em Minha conta.' }, 400);
      const ended = await tenantTransaction(account.id, (run) =>
        endUserSessions(run, account.id, id),
      );
      return json({ ended });
    }
  } catch (error) {
    if (error instanceof TeamRuleError) return json({ error: error.message }, 400);
    if ((error as { code?: string }).code === '23505')
      return json({ error: 'Este usuário já existe. Escolha outro.' }, 409);
    throw error;
  }
  return json({ error: 'Ação inválida.' }, 400);
}
