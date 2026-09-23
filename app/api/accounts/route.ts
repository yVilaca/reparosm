import {
  currentAccount,
  normalizeUser,
  passwordHash,
  passwordProblem,
  publicAccount,
  revokeSessions,
  sameOrigin,
} from '@/lib/auth';
import { transaction } from '@/lib/db';
import {
  createAccount,
  deleteAccount,
  findAccountByUsername,
  getAccount,
  listAccounts,
  listPendingPasswordRequests,
  resolvePasswordRequest,
  setPasswordHash,
  updateAccountProfile,
} from '@/lib/repos/accounts';
import type { DataObject } from '@/lib/types';

const PLANS = ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const;
const STATUSES = ['active', 'suspended', 'cancelled'] as const;

const admin = async (request: Request) => {
  const a = await currentAccount(request);
  return a?.role === 'admin' ? a : null;
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
  if (!(await admin(request))) return denied();
  const accounts = (await listAccounts()).map(publicAccount);
  const requests = await listPendingPasswordRequests();
  return Response.json({ accounts, requests }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await admin(request))) return denied();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (!isObject(body)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  if (body.action === 'reset-password') {
    const account = await getAccount(String(body.id || ''));
    if (!account || account.id === 'account-admin')
      return Response.json({ error: 'Conta não encontrada ou protegida' }, { status: 400 });
    if (body.identityConfirmed !== true)
      return Response.json(
        { error: 'Confirme a identidade do lojista antes de redefinir.' },
        { status: 400 },
      );
    const problem = passwordProblem(String(body.password || ''));
    if (problem) return Response.json({ error: problem }, { status: 400 });
    await setPasswordHash(
      account.id,
      await passwordHash(account.username, String(body.password)),
      true,
    );
    await revokeSessions(account.id);
    await resolvePasswordRequest(account.id);
    return Response.json({ ok: true });
  }
  const old = body.id ? await getAccount(String(body.id)) : null;
  if (old) {
    if (old.id === 'account-admin')
      return Response.json({ error: 'Esta conta não pode ser alterada aqui' }, { status: 400 });
    const status = isOneOf(body.status, STATUSES) ? body.status : old.status;
    const updated = await updateAccountProfile(old.id, {
      name:
        String(body.name || old.name)
          .trim()
          .slice(0, 80) || old.name,
      status,
      plan: isOneOf(body.plan, PLANS) ? body.plan : old.plan,
      dueDate: String(body.dueDate ?? old.dueDate ?? '').slice(0, 10),
    });
    if (status !== 'active') await revokeSessions(old.id);
    return Response.json({ account: updated && publicAccount(updated) });
  }
  const username = normalizeUser(String(body.username || ''));
  if (username.length < 3)
    return Response.json({ error: 'Use um usuário com pelo menos 3 caracteres' }, { status: 400 });
  if (
    ['admin', 'adminreparosm'].includes(username) ||
    (await findAccountByUsername(username)) ||
    (await getAccount(`account-${username}`))
  )
    return Response.json({ error: 'Este usuário já existe' }, { status: 409 });
  const problem = passwordProblem(String(body.password || ''));
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const account = await createAccount({
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
  if (!sameOrigin(request) || !(await admin(request))) return denied();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === 'account-admin')
    return Response.json({ error: 'Esta conta não pode ser excluída' }, { status: 400 });
  if (!(await getAccount(id)))
    return Response.json({ error: 'Conta não encontrada' }, { status: 404 });
  // Business data still lives in `records` until the relational migration finishes.
  const removedRecords = await transaction(async (run) => {
    const removed = await run(
      `DELETE FROM records WHERE data::jsonb->>'_accountId' = $1 RETURNING id`,
      [id],
    );
    await deleteAccount(id, run);
    return removed.length;
  });
  return Response.json({ ok: true, removedRecords });
}
