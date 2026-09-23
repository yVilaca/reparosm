import {
  currentAccount,
  normalizeUser,
  passwordHash,
  passwordProblem,
  publicAccount,
  revokeSessions,
  sameOrigin,
} from '@/lib/auth';
import { deleteRecord, getRecord, listRecords, saveRecord } from '@/lib/db';
import type { DataObject } from '@/lib/types';

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
  const accounts = (await listRecords('account'))
    .filter((record) => record.type === 'account')
    .map((account) => publicAccount({ id: account.id, ...account.data }));
  const requests = (await listRecords('password-request'))
    .filter((record) => record.type === 'password-request' && record.data.status === 'pending')
    .map((request) => ({ id: request.id, ...request.data }));
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
    const account = await getRecord(String(body.id || ''));
    if (!account || account.type !== 'account' || account.id === 'account-admin')
      return Response.json({ error: 'Conta não encontrada ou protegida' }, { status: 400 });
    if (body.identityConfirmed !== true)
      return Response.json(
        { error: 'Confirme a identidade do lojista antes de redefinir.' },
        { status: 400 },
      );
    const problem = passwordProblem(String(body.password || ''));
    if (problem) return Response.json({ error: problem }, { status: 400 });
    await saveRecord(account.id, 'account', {
      ...account.data,
      passwordHash: await passwordHash(account.data.username, String(body.password)),
      mustChangePassword: false,
      passwordResetAt: new Date().toISOString(),
    });
    await revokeSessions(account.id);
    const requestId = `password-request-${account.id}`,
      pending = await getRecord(requestId);
    if (pending)
      await saveRecord(requestId, 'password-request', {
        ...pending.data,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });
    return Response.json({ ok: true });
  }
  const old = body.id ? await getRecord(String(body.id)) : null;
  if (old) {
    if (old.type !== 'account' || old.id === 'account-admin')
      return Response.json({ error: 'Esta conta não pode ser alterada aqui' }, { status: 400 });
    const status = isOneOf(body.status, ['active', 'suspended', 'cancelled'] as const)
        ? body.status
        : old.data.status,
      plan = isOneOf(body.plan, ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const)
        ? body.plan
        : old.data.plan;
    const data = {
      ...old.data,
      name:
        String(body.name || old.data.name)
          .trim()
          .slice(0, 80) || old.data.name,
      status,
      plan,
      dueDate: String(body.dueDate ?? old.data.dueDate ?? '').slice(0, 10),
      updatedAt: new Date().toISOString(),
    };
    await saveRecord(old.id, 'account', data);
    if (status !== 'active') await revokeSessions(old.id);
    return Response.json({ account: publicAccount({ id: old.id, ...data }) });
  }
  const username = normalizeUser(String(body.username || ''));
  if (username.length < 3)
    return Response.json({ error: 'Use um usuário com pelo menos 3 caracteres' }, { status: 400 });
  if (['admin', 'adminreparosm'].includes(username) || (await getRecord(`account-${username}`)))
    return Response.json({ error: 'Este usuário já existe' }, { status: 409 });
  const problem = passwordProblem(String(body.password || ''));
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const id = `account-${username}`,
    data = {
      username,
      name: String(body.name || username)
        .trim()
        .slice(0, 80),
      role: 'merchant',
      status: 'active',
      plan: isOneOf(body.plan, ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const)
        ? body.plan
        : 'Mensal',
      dueDate: String(body.dueDate || '').slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      passwordHash: await passwordHash(username, String(body.password)),
      mustChangePassword: false,
    };
  await saveRecord(id, 'account', data);
  return Response.json({ account: publicAccount({ id, ...data }) }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !(await admin(request))) return denied();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === 'account-admin')
    return Response.json({ error: 'Esta conta não pode ser excluída' }, { status: 400 });
  const account = await getRecord(id);
  if (!account || account.type !== 'account')
    return Response.json({ error: 'Conta não encontrada' }, { status: 404 });
  const records = await listRecords();
  const owned = records.filter(
    (record) =>
      record.id !== id &&
      (record.data._accountId === id ||
        (record.type === 'session' && record.data.accountId === id)),
  );
  for (const record of owned) await deleteRecord(record.id);
  await deleteRecord(id);
  return Response.json({ ok: true, removedRecords: owned.length });
}
