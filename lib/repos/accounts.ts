import { adminQuery, adminTransaction, type AdminActor, type Query } from '@/lib/db';
import { dateOrNull, iso, type Timestamp } from '@/lib/repos/rows';
import { createUser } from '@/lib/repos/users';
import type { Account, AccountRole, AccountStatus } from '@/lib/types';

type AccountRow = {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  plan: string | null;
  due_date: string | null;
  access_policy: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// due_date as text avoids pg turning a date into local midnight and shifting its day.
export const accountColumns = `a.id, a.username, a.name, a.role, a.status, a.plan,
  a.due_date::text AS due_date, a.access_policy, a.created_at, a.updated_at`;

export const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  status: row.status,
  plan: row.plan ?? undefined,
  dueDate: row.due_date ?? '',
  accessPolicy: row.access_policy ?? undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

/** A loja vista pelo administrador: quem é o dono, quantas pessoas usam e quando entraram. */
export type AdminStore = Account & {
  ownerName: string;
  ownerUsername: string;
  users: number;
  lastLoginAt?: string;
};

type AdminStoreRow = AccountRow & {
  owner_name: string | null;
  owner_username: string | null;
  users: number;
  last_login_at: Timestamp | null;
};

const storeColumns = `${accountColumns},
  (SELECT count(*)::int FROM users u WHERE u.account_id = a.id AND u.status = 'active') AS users,
  (SELECT max(u.last_login_at) FROM users u WHERE u.account_id = a.id) AS last_login_at,
  owner.name AS owner_name, owner.username AS owner_username`;
const storeFrom = `accounts a LEFT JOIN LATERAL (
    SELECT u.name, u.username FROM users u
    WHERE u.account_id = a.id AND u.role = 'owner'
    ORDER BY u.status, u.created_at, u.id LIMIT 1
  ) owner ON true`;

const toStore = (row: AdminStoreRow): AdminStore => ({
  ...toAccount(row),
  ownerName: row.owner_name ?? '',
  ownerUsername: row.owner_username ?? '',
  users: row.users,
  lastLoginAt: row.last_login_at ? iso(row.last_login_at) : undefined,
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

/** As lojas (sem a conta do administrador), da mais recente para a mais antiga. */
export async function listStores(actor: AdminActor) {
  const rows = await adminQuery<AdminStoreRow>(
    actor,
    `SELECT ${storeColumns} FROM ${storeFrom}
     WHERE a.role = 'merchant' ORDER BY a.created_at DESC, a.id DESC`,
  );
  return rows.map(toStore);
}

export async function getStoreAsAdmin(actor: AdminActor, id: string) {
  const [row] = await adminQuery<AdminStoreRow>(
    actor,
    `SELECT ${storeColumns} FROM ${storeFrom} WHERE a.id = $1 AND a.role = 'merchant'`,
    [id],
  );
  return row ? toStore(row) : null;
}

/** Cria a loja e o Dono dela, com senha provisória, numa transação só. */
export async function createStore(
  actor: AdminActor,
  store: {
    username: string;
    name: string;
    ownerName: string;
    passwordHash: string;
    plan?: string;
    dueDate?: string;
  },
) {
  return adminTransaction(actor, async (run) => {
    const [row] = await run<AccountRow>(
      `INSERT INTO accounts AS a (id, username, name, role, status, plan, due_date)
       VALUES ($1, $2, $3, 'merchant', 'active', $4, $5)
       RETURNING ${accountColumns}`,
      [
        `account-${store.username}`,
        store.username,
        store.name,
        store.plan ?? null,
        dateOrNull(store.dueDate),
      ],
    );
    await createUser(run, row.id, {
      username: store.username,
      name: store.ownerName,
      role: 'owner',
      passwordHash: store.passwordHash,
    });
    return toAccount(row);
  });
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

/**
 * Pagamento recebido: soma o período do plano ao vencimento (ou a hoje, se já
 * venceu). Cortesia não vence, então não renova.
 */
export async function renewAccount(actor: AdminActor, id: string) {
  const [row] = await adminQuery<AccountRow>(
    actor,
    `UPDATE accounts AS a SET
       due_date = GREATEST(COALESCE(a.due_date, today), today) + CASE a.plan
         WHEN 'Trimestral' THEN interval '3 months'
         WHEN 'Anual' THEN interval '1 year'
         ELSE interval '1 month' END,
       updated_at = now()
     FROM (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today) t
     WHERE a.id = $1 AND a.role = 'merchant' AND COALESCE(a.plan, '') <> 'Cortesia'
     RETURNING ${accountColumns}`,
    [id],
  );
  return row ? toAccount(row) : null;
}

/** Deletes the account; users, sessions, requests and every business row cascade. */
export async function deleteAccount(actor: AdminActor, id: string) {
  const rows = await adminQuery(actor, 'DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}
