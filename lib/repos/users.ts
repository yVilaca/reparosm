import { authQuery, type Query } from '@/lib/db';
import { iso, type Timestamp } from '@/lib/repos/rows';
import type {
  PasswordRequest,
  StoreUser,
  TeamMember,
  UserAccess,
  UserRole,
  UserStatus,
} from '@/lib/types';

/*
 * Usuários de uma loja. As funções recebem um `run` já no contexto certo (loja,
 * para o Dono em Equipe, ou administrador) e sempre filtram pela loja também.
 */

export type UserRow = {
  id: string;
  account_id: string;
  username: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  email: string | null;
  email_verified_at: Timestamp | null;
  must_change_password: boolean;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export const userColumns = `u.id, u.account_id, u.username, u.name, u.role, u.status,
  u.email, u.email_verified_at, u.must_change_password, u.last_login_at, u.created_at,
  u.updated_at`;

export const toUser = (row: UserRow): StoreUser => ({
  id: row.id,
  accountId: row.account_id,
  username: row.username,
  name: row.name,
  role: row.role,
  status: row.status,
  email: row.email ?? undefined,
  emailVerified: Boolean(row.email_verified_at),
  mustChangePassword: row.must_change_password,
  lastLoginAt: row.last_login_at ? iso(row.last_login_at) : undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

/** Regra da equipe que o usuário vê como mensagem (ex.: o último Dono). */
export class TeamRuleError extends Error {}

/**
 * Já criou a senha (entrou, confirmou o e-mail ou tem senha provisória antiga);
 * senão, depende de haver convite valendo. Usa o alias `u` de users.
 */
export const accessColumn = `CASE
    WHEN u.last_login_at IS NOT NULL OR u.email_verified_at IS NOT NULL OR u.must_change_password
      THEN 'ready'
    WHEN EXISTS (SELECT 1 FROM access_links l
                 WHERE l.user_id = u.id AND l.purpose = 'invite' AND l.used_at IS NULL
                   AND l.expires_at > now())
      THEN 'invited'
    ELSE 'invite-expired' END`;

export async function listUsers(run: Query, accountId: string): Promise<TeamMember[]> {
  const rows = await run<
    UserRow & { sessions: number; password_requested: boolean; access: UserAccess }
  >(
    `SELECT ${userColumns}, ${accessColumn} AS access,
       (SELECT count(*)::int FROM sessions s
        WHERE s.user_id = u.id AND s.expires_at > now()) AS sessions,
       EXISTS (SELECT 1 FROM password_requests r
               WHERE r.user_id = u.id AND r.status = 'pending') AS password_requested
     FROM users u WHERE u.account_id = $1
     ORDER BY u.status, CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, lower(u.name), u.id`,
    [accountId],
  );
  return rows.map((row) => ({
    ...toUser(row),
    sessions: row.sessions,
    passwordRequested: row.password_requested,
    access: row.access,
  }));
}

/** Quem vai receber um link: dados da pessoa, da loja e se já criou a senha. */
export type LinkTarget = {
  id: string;
  accountId: string;
  username: string;
  name: string;
  role: UserRole;
  email?: string;
  storeName: string;
  ready: boolean;
};

/** Pessoa ativa de uma loja ativa (nunca a conta do administrador). */
export async function linkTarget(
  run: Query,
  where: { userId: string; accountId?: string } | { username: string },
): Promise<LinkTarget | null> {
  const byId = 'userId' in where;
  const [row] = await run<{
    id: string;
    account_id: string;
    username: string;
    name: string;
    role: UserRole;
    email: string | null;
    store_name: string;
    access: UserAccess;
  }>(
    `SELECT u.id, u.account_id, u.username, u.name, u.role, u.email, a.name AS store_name,
            ${accessColumn} AS access
     FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.status = 'active' AND a.status = 'active' AND a.role = 'merchant'
       AND ${byId ? 'u.id = $1 AND ($2::text IS NULL OR u.account_id = $2)' : 'u.username = $1'}`,
    byId ? [where.userId, where.accountId ?? null] : [where.username],
  );
  return row
    ? {
        id: row.id,
        accountId: row.account_id,
        username: row.username,
        name: row.name,
        role: row.role,
        email: row.email ?? undefined,
        storeName: row.store_name,
        ready: row.access === 'ready',
      }
    : null;
}

/** Senha que nenhuma senha digitada confere: a pessoa cria a dela pelo link. */
const NO_PASSWORD = '!';

/**
 * Cadastra alguém na loja, sem senha: o acesso começa pelo link de convite.
 * Usuário ou e-mail repetidos viram o erro 23505 do banco.
 */
export async function createUser(
  run: Query,
  accountId: string,
  user: { username: string; name: string; role: UserRole; email?: string },
) {
  const [row] = await run<UserRow>(
    `INSERT INTO users AS u (id, account_id, username, name, role, status, email, password_hash)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
     RETURNING ${userColumns}`,
    [
      `user-${user.username}`,
      accountId,
      user.username,
      user.name,
      user.role,
      user.email ?? null,
      NO_PASSWORD,
    ],
  );
  return toUser(row);
}

/**
 * O Dono (ou o administrador) corrige o e-mail de alguém: passa a valer na hora,
 * mas sem confirmação até a pessoa usar um link recebido nele.
 */
export async function setUserEmail(
  run: Query,
  accountId: string,
  id: string,
  email: string | null,
) {
  const [row] = await run<UserRow>(
    `UPDATE users AS u SET email = $3,
       email_verified_at = CASE WHEN u.email IS NOT DISTINCT FROM $3 THEN u.email_verified_at END,
       updated_at = now()
     WHERE u.id = $1 AND u.account_id = $2
     RETURNING ${userColumns}`,
    [id, accountId, email],
  );
  return row ? toUser(row) : null;
}

/**
 * Muda nome, papel ou situação. A loja nunca fica sem um Dono ativo, e quem é
 * desativado sai de todos os aparelhos na hora.
 */
export async function updateUser(
  run: Query,
  accountId: string,
  id: string,
  changes: { name?: string; role?: UserRole; status?: UserStatus },
) {
  const [current] = await run<{ role: UserRole; status: UserStatus }>(
    'SELECT role, status FROM users WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  if (!current) return null;
  const role = changes.role ?? current.role;
  const status = changes.status ?? current.status;
  const leavesOwners =
    current.role === 'owner' &&
    current.status === 'active' &&
    (role !== 'owner' || status !== 'active');
  if (leavesOwners) {
    // ponytail: sem trava de linha; dois donos se rebaixando no mesmo instante
    // poderiam deixar a loja sem dono. O administrador ainda resolve pela ficha da loja.
    const [{ owners }] = await run<{ owners: number }>(
      `SELECT count(*)::int AS owners FROM users
       WHERE account_id = $1 AND role = 'owner' AND status = 'active' AND id <> $2`,
      [accountId, id],
    );
    if (!owners) throw new TeamRuleError('A loja precisa de pelo menos um Dono ativo.');
  }
  const [row] = await run<UserRow>(
    `UPDATE users AS u SET name = COALESCE($3, u.name), role = $4, status = $5, updated_at = now()
     WHERE u.id = $1 AND u.account_id = $2
     RETURNING ${userColumns}`,
    [id, accountId, changes.name ?? null, role, status],
  );
  if (status === 'disabled') await endUserSessions(run, accountId, id);
  return row ? toUser(row) : null;
}

export async function endUserSessions(run: Query, accountId: string, userId: string) {
  const rows = await run(
    'DELETE FROM sessions WHERE user_id = $1 AND account_id = $2 RETURNING token_hash',
    [userId, accountId],
  );
  return rows.length;
}

/**
 * "Esqueci minha senha" de quem não tem e-mail: abre (ou mantém) o pedido para o
 * Dono ou o administrador mandar um link. A conta do administrador não pede por aqui.
 */
export async function requestPasswordReset(username: string) {
  await authQuery(
    username,
    `INSERT INTO password_requests (user_id, account_id, status)
     SELECT id, account_id, 'pending' FROM users
     WHERE username = $1 AND status = 'active' AND account_id <> 'account-admin'
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'pending', created_at = now(), resolved_at = NULL
       WHERE password_requests.status <> 'pending'`,
    [username],
  );
}

/**
 * Pedidos de senha pendentes. O de um Dono é resolvido pelo administrador
 * (todas as lojas); o de um Funcionário, pelo Dono da loja dele.
 */
export async function listPasswordRequests(
  run: Query,
  scope: { role: 'owner' } | { role: 'staff'; accountId: string },
): Promise<PasswordRequest[]> {
  const rows = await run<{
    user_id: string;
    account_id: string;
    username: string;
    name: string;
    store_name: string;
    created_at: Timestamp;
  }>(
    `SELECT r.user_id, r.account_id, u.username, u.name, a.name AS store_name, r.created_at
     FROM password_requests r
     JOIN users u ON u.id = r.user_id
     JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'pending' AND u.status = 'active' AND u.role = $1
       AND ($2::text IS NULL OR r.account_id = $2)
     ORDER BY r.created_at, r.user_id`,
    [scope.role, scope.role === 'staff' ? scope.accountId : null],
  );
  return rows.map((row) => ({
    id: `password-request-${row.user_id}`,
    userId: row.user_id,
    accountId: row.account_id,
    username: row.username,
    name: row.name,
    storeName: row.store_name,
    createdAt: iso(row.created_at),
  }));
}
