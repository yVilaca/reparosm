import { adminQuery, authQuery, type AdminActor, type Query } from '@/lib/db';
import { dateOrNull, iso, type Timestamp } from '@/lib/repos/rows';
import type { Account, AccountRole, AccountStatus, PasswordRequest } from '@/lib/types';

type AccountRow = {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  password_hash: string | null;
  must_change_password: boolean;
  plan: string | null;
  due_date: string | null;
  access_policy: string | null;
  password_reset_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// due_date as text avoids pg turning a date into local midnight and shifting its day.
// The guarded database function returns NULL outside login/admin contexts.
export const accountColumns = `a.id, a.username, a.name, a.role, a.status,
  public.account_password_hash(a.id) AS password_hash,
  a.must_change_password, a.plan, a.due_date::text AS due_date, a.access_policy,
  a.password_reset_at, a.created_at, a.updated_at`;

export const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  status: row.status,
  passwordHash: row.password_hash ?? '',
  mustChangePassword: row.must_change_password,
  plan: row.plan ?? undefined,
  dueDate: row.due_date ?? '',
  accessPolicy: row.access_policy ?? undefined,
  passwordResetAt: row.password_reset_at ? iso(row.password_reset_at) : undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export async function getAccountAsAdmin(actor: AdminActor, id: string) {
  const [row] = await adminQuery<AccountRow>(
    actor,
    `SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`,
    [id],
  );
  return row ? toAccount(row) : null;
}

/** Reads only the status needed by public storefront and quote flows. */
export async function getAccountStatus(id: string, run: Query) {
  const [row] = await run<{ status: AccountStatus }>(`SELECT status FROM accounts WHERE id = $1`, [
    id,
  ]);
  return row?.status ?? null;
}

export async function findAccountByUsername(username: string) {
  const [row] = await authQuery<AccountRow>(
    username,
    `SELECT ${accountColumns} FROM accounts a WHERE a.username = $1`,
    [username],
  );
  return row ? toAccount(row) : null;
}

export async function accountUsernameExistsAsAdmin(actor: AdminActor, username: string) {
  const rows = await adminQuery<{ id: string }>(
    actor,
    'SELECT id FROM accounts WHERE username = $1 LIMIT 1',
    [username],
  );
  return rows.length > 0;
}

export async function listAccounts(actor: AdminActor) {
  const rows = await adminQuery<AccountRow>(
    actor,
    `SELECT ${accountColumns} FROM accounts a ORDER BY a.created_at DESC, a.id DESC`,
  );
  return rows.map(toAccount);
}

export async function createAccount(
  actor: AdminActor,
  account: {
    id: string;
    username: string;
    name: string;
    role: AccountRole;
    passwordHash: string;
    plan?: string;
    dueDate?: string;
  },
) {
  const [row] = await adminQuery<AccountRow>(
    actor,
    `INSERT INTO accounts AS a (id, username, name, role, status, password_hash, plan, due_date)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
     RETURNING ${accountColumns}`,
    [
      account.id,
      account.username,
      account.name,
      account.role,
      account.passwordHash,
      account.plan ?? null,
      dateOrNull(account.dueDate),
    ],
  );
  return toAccount(row);
}

export async function updateAccountProfile(
  actor: AdminActor,
  id: string,
  profile: { name: string; status: AccountStatus; plan?: string; dueDate?: string },
) {
  const [row] = await adminQuery<AccountRow>(
    actor,
    `UPDATE accounts AS a SET name = $2, status = $3, plan = $4, due_date = $5, updated_at = now()
     WHERE a.id = $1 RETURNING ${accountColumns}`,
    [id, profile.name, profile.status, profile.plan ?? null, dateOrNull(profile.dueDate)],
  );
  return row ? toAccount(row) : null;
}

/** Stores a user's upgraded password hash during successful login. */
export async function setPasswordHashForLogin(username: string, id: string, passwordHash: string) {
  await authQuery(
    username,
    `UPDATE accounts SET password_hash = $3, must_change_password = false, updated_at = now()
     WHERE id = $1 AND username = $2`,
    [id, username, passwordHash],
  );
}

/** Stores a password reset approved by an administrator. */
export async function setPasswordHashAsAdmin(actor: AdminActor, id: string, passwordHash: string) {
  await adminQuery(
    actor,
    `UPDATE accounts SET password_hash = $2, must_change_password = false, updated_at = now(),
       password_reset_at = now()
     WHERE id = $1`,
    [id, passwordHash],
  );
}

/** Deletes the account; sessions, password requests and WhatsApp settings cascade. */
export async function deleteAccount(actor: AdminActor, id: string) {
  const rows = await adminQuery(actor, 'DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/** Resolves the merchant and opens a reset request in the same username scope. */
export async function requestPasswordReset(username: string) {
  return authQuery(
    username,
    `
    INSERT INTO password_requests (account_id, status)
    SELECT id, 'pending' FROM accounts WHERE username = $1 AND role = 'merchant'
    ON CONFLICT (account_id) DO UPDATE
      SET status = 'pending', created_at = now(), resolved_at = NULL
      WHERE password_requests.status <> 'pending'
  `,
    [username],
  );
}

export async function resolvePasswordRequest(actor: AdminActor, accountId: string) {
  await adminQuery(
    actor,
    `UPDATE password_requests SET status = 'resolved', resolved_at = now()
     WHERE account_id = $1 AND status = 'pending'`,
    [accountId],
  );
}

export async function listPendingPasswordRequests(actor: AdminActor): Promise<PasswordRequest[]> {
  const rows = await adminQuery<{ account_id: string; username: string; created_at: Timestamp }>(
    actor,
    `SELECT r.account_id, a.username, r.created_at FROM password_requests r
     JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'pending' ORDER BY r.created_at, r.account_id`,
  );
  return rows.map((row) => ({
    id: `password-request-${row.account_id}`,
    accountId: row.account_id,
    username: row.username,
    status: 'pending',
    createdAt: iso(row.created_at),
  }));
}
