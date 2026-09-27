import {
  currentAccount,
  normalizeUser,
  passwordHash,
  passwordProblem,
  publicAccount,
  sameOrigin,
} from '@/lib/auth';
import {
  accountUsernameExistsAsAdmin,
  createAccount,
  deleteAccount,
  getAccountAsAdmin,
  listAccounts,
  listPendingPasswordRequests,
  resolvePasswordRequest,
  setPasswordHashAsAdmin,
  updateAccountProfile,
} from '@/lib/repos/accounts';
import { revokeSessionsAsAdmin } from '@/lib/repos/sessions';
import type { AdminActor } from '@/lib/db';
import type { DataObject } from '@/lib/types';

const PLANS = ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const;
const STATUSES = ['active', 'suspended', 'cancelled'] as const;

const admin = async (request: Request): Promise<AdminActor | null> => {
  const a = await currentAccount(request);
  return a?.role === 'admin' ? { id: a.id, role: 'admin' } : null;
};
const denied = () =>
  Response.json(
    { error: 'Acesso negado' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);

export async function GET(request: Request) {
  const actor = await admin(request);
  if (!actor) return denied();
  const accounts = (await listAccounts(actor)).map(publicAccount);
  const requests = await listPendingPasswordRequests(actor);
  return Response.json({ accounts, requests }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return denied();
  const actor = await admin(request);
  if (!actor) return denied();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (!isObject(body)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  if (body.action === 'reset-password') {
    const account = await getAccountAsAdmin(actor, String(body.id || ''));
    if (!account || account.id === 'account-admin')
      return Response.json({ error: 'Conta não encontrada ou protegida' }, { status: 400 });
    if (body.identityConfirmed !== true)
      return Response.json(
        { error: 'Confirme a identidade do lojista antes de redefinir.' },
        { status: 400 },
      );
    const problem = passwordProblem(String(body.password || ''));
    if (problem) return Response.json({ error: problem }, { status: 400 });
    await setPasswordHashAsAdmin(
      actor,
      account.id,
      await passwordHash(account.username, String(body.password)),
    );
    await revokeSessionsAsAdmin(actor, account.id);
    await resolvePasswordRequest(actor, account.id);
    return Response.json({ ok: true });
  }
  const old = body.id ? await getAccountAsAdmin(actor, String(body.id)) : null;
  if (old) {
    if (old.id === 'account-admin')
      return Response.json({ error: 'Esta conta não pode ser alterada aqui' }, { status: 400 });
    const status = isOneOf(body.status, STATUSES) ? body.status : old.status;
    const updated = await updateAccountProfile(actor, old.id, {
      name:
        String(body.name || old.name)
          .trim()
          .slice(0, 80) || old.name,
      status,
      plan: isOneOf(body.plan, PLANS) ? body.plan : old.plan,
      dueDate: String(body.dueDate ?? old.dueDate ?? '').slice(0, 10),
    });
    if (status !== 'active') await revokeSessionsAsAdmin(actor, old.id);
    return Response.json({ account: updated && publicAccount(updated) });
  }
  const username = normalizeUser(String(body.username || ''));
  if (username.length < 3)
    return Response.json({ error: 'Use um usuário com pelo menos 3 caracteres' }, { status: 400 });
  if (
    ['admin', 'adminreparosm'].includes(username) ||
    (await accountUsernameExistsAsAdmin(actor, username)) ||
    (await getAccountAsAdmin(actor, `account-${username}`))
  )
    return Response.json({ error: 'Este usuário já existe' }, { status: 409 });
  const problem = passwordProblem(String(body.password || ''));
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const account = await createAccount(actor, {
    id: `account-${username}`,
    username,
    name: String(body.name || username)
      .trim()
      .slice(0, 80),
    role: 'merchant',
    plan: isOneOf(body.plan, PLANS) ? body.plan : 'Mensal',
    dueDate: String(body.dueDate || '').slice(0, 10),
    passwordHash: await passwordHash(username, String(body.password)),
  });
  return Response.json({ account: publicAccount(account) }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return denied();
  const actor = await admin(request);
  if (!actor) return denied();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === 'account-admin')
    return Response.json({ error: 'Esta conta não pode ser excluída' }, { status: 400 });
  if (!(await getAccountAsAdmin(actor, id)))
    return Response.json({ error: 'Conta não encontrada' }, { status: 404 });
  // Every table references accounts with ON DELETE CASCADE.
  await deleteAccount(actor, id);
  return Response.json({ ok: true });
}
