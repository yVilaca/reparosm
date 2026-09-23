import { query, type Query } from '@/lib/db';
import { dateOrNull, iso, type Timestamp } from '@/lib/repos/rows';
import type { Account, AccountRole, AccountStatus, PasswordRequest } from '@/lib/types';

type AccountRow = {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  password_hash: string;
  must_change_password: boolean;
  plan: string | null;
  due_date: string | null;
  access_policy: string | null;
  password_reset_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// due_date as text: pg turns `date` into a local-midnight Date, which can shift the day.
export const accountColumns = `a.id, a.username, a.name, a.role, a.status, a.password_hash,
  a.must_change_password, a.plan, a.due_date::text AS due_date, a.access_policy,
  a.password_reset_at, a.created_at, a.updated_at`;

export const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  status: row.status,
  passwordHash: row.password_hash,
  mustChangePassword: row.must_change_password,
  plan: row.plan ?? undefined,
  dueDate: row.due_date ?? '',
  accessPolicy: row.access_policy ?? undefined,
  passwordResetAt: row.password_reset_at ? iso(row.password_reset_at) : undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export async function getAccount(id: string, run: Query = query) {
  const [row] = await run<AccountRow>(`SELECT ${accountColumns} FROM accounts a WHERE a.id = $1`, [
    id,
  ]);
  return row ? toAccount(row) : null;
}

export async function findAccountByUsername(username: string) {
  const [row] = await query<AccountRow>(
    `SELECT ${accountColumns} FROM accounts a WHERE a.username = $1`,
    [username],
  );
  return row ? toAccount(row) : null;
}

export async function listAccounts() {
  const rows = await query<AccountRow>(
    `SELECT ${accountColumns} FROM accounts a ORDER BY a.created_at DESC`,
  );
  return rows.map(toAccount);
}

export async function createAccount(account: {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  passwordHash: string;
  plan?: string;
  dueDate?: string;
}) {
  const [row] = await query<AccountRow>(
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
  id: string,
  profile: { name: string; status: AccountStatus; plan?: string; dueDate?: string },
) {
  const [row] = await query<AccountRow>(
    `UPDATE accounts AS a SET name = $2, status = $3, plan = $4, due_date = $5, updated_at = now()
     WHERE a.id = $1 RETURNING ${accountColumns}`,
    [id, profile.name, profile.status, profile.plan ?? null, dateOrNull(profile.dueDate)],
  );
  return row ? toAccount(row) : null;
}

/** Stores a new password hash; `reset` marks an administrator reset. */
export async function setPasswordHash(id: string, passwordHash: string, reset = false) {
  await query(
    `UPDATE accounts SET password_hash = $2, must_change_password = false, updated_at = now(),
       password_reset_at = CASE WHEN $3 THEN now() ELSE password_reset_at END
     WHERE id = $1`,
    [id, passwordHash, reset],
  );
}

/** Deletes the account; sessions, password requests and WhatsApp settings cascade. */
export async function deleteAccount(id: string, run: Query = query) {
  const rows = await run('DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/** Opens a request unless one is already pending (keeps the original request time). */
export async function requestPasswordReset(accountId: string) {
  await query(
    `INSERT INTO password_requests (account_id, status) VALUES ($1, 'pending')
     ON CONFLICT (account_id) DO UPDATE
       SET status = 'pending', created_at = now(), resolved_at = NULL
       WHERE password_requests.status <> 'pending'`,
    [accountId],
  );
}

export async function resolvePasswordRequest(accountId: string) {
  await query(
    `UPDATE password_requests SET status = 'resolved', resolved_at = now()
     WHERE account_id = $1 AND status = 'pending'`,
    [accountId],
  );
}

export async function listPendingPasswordRequests(): Promise<PasswordRequest[]> {
  const rows = await query<{ account_id: string; username: string; created_at: Timestamp }>(
    `SELECT r.account_id, a.username, r.created_at FROM password_requests r
     JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'pending' ORDER BY r.created_at`,
  );
  return rows.map((row) => ({
    id: `password-request-${row.account_id}`,
    accountId: row.account_id,
    username: row.username,
    status: 'pending',
    createdAt: iso(row.created_at),
  }));
}
