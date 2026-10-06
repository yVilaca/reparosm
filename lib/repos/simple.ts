// Account-scoped CRUD for tables that map one-to-one onto a record type's fields.
import { tenantQueryFor, type Query } from '@/lib/db';
import type { TableRepo } from '@/lib/repos';
import {
  compact,
  dateOrNull,
  iso,
  money,
  textOrNull,
  toRecord,
  type Timestamp,
} from '@/lib/repos/rows';
import type { BusinessRecordType, DataObject, RecordData } from '@/lib/types';

type Kind =
  | 'text' // optional text: '' → NULL
  | 'required' // NOT NULL text
  | 'money'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'order'; // order id, kept only when the order belongs to the same account

/** [column, record field, kind] */
export type Column = readonly [string, string, Kind];

const toParam = (kind: Kind, value: unknown) => {
  switch (kind) {
    case 'text':
    case 'order':
      return textOrNull(value);
    case 'required':
      return typeof value === 'string' ? value : '';
    case 'money':
      return money(value);
    case 'integer':
      return Math.round(money(value));
    case 'boolean':
      return value === true;
    case 'date':
      return dateOrNull(value);
    case 'timestamp':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  }
};

const fromColumn = (kind: Kind, value: unknown) => {
  if (value === null || value === undefined) return value;
  if (kind === 'money' || kind === 'integer') return money(value);
  if (kind === 'timestamp') return iso(value as Timestamp);
  return value;
};

export function simpleRepo<T extends BusinessRecordType>(options: {
  type: T;
  table: string;
  columns: readonly Column[];
  /** Fixed column value that separates record types sharing one table. */
  scope?: readonly [column: string, value: string];
}): TableRepo<T> {
  const { type, table, columns, scope } = options;
  const selected = columns
    .map(([column, , kind]) => (kind === 'date' ? `t.${column}::text AS ${column}` : `t.${column}`))
    .join(', ');
  const select = `SELECT t.id, t.created_at, t.updated_at, ${selected} FROM ${table} t`;
  const scoped = scope ? ` AND t.${scope[0]} = '${scope[1]}'` : '';
  const orderBy =
    type === 'part' || type === 'automation'
      ? 'LOWER(t.name), t.id'
      : type === 'film'
        ? 'LOWER(t.brand), LOWER(t.model), t.id'
        : type === 'tutorial'
          ? 'LOWER(t.title), t.id'
          : type === 'payment' || type === 'expense'
            ? "COALESCE(t.date, (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date) DESC, t.created_at DESC, t.id DESC"
            : 't.created_at DESC, t.id DESC';

  const toTypedRecord = (row: Record<string, unknown>) =>
    toRecord(
      type,
      String(row.id),
      compact({
        ...Object.fromEntries(
          columns.map(([column, field, kind]) => [field, fromColumn(kind, row[column])]),
        ),
        createdAt: iso(row.created_at as Timestamp),
        updatedAt: iso(row.updated_at as Timestamp),
      }),
    );

  const get = async (accountId: string, id: string, run?: Query) => {
    const execute = tenantQueryFor(accountId, run);
    const [row] = await execute(`${select} WHERE t.account_id = $1 AND t.id = $2${scoped}`, [
      accountId,
      id,
    ]);
    return row ? toTypedRecord(row) : null;
  };

  // Parameters: $1 id, $2 account_id, then one per column ($3…).
  const columnValues = columns.map(([, , kind], index) =>
    kind === 'order'
      ? `(SELECT id FROM orders WHERE id = $${index + 3} AND account_id = $2)`
      : `$${index + 3}`,
  );
  const names = ['id', 'account_id', ...(scope ? [scope[0]] : []), ...columns.map(([c]) => c)];
  const values = ['$1', '$2', ...(scope ? [`'${scope[1]}'`] : []), ...columnValues];
  const insert = `INSERT INTO ${table} AS t (${names.join(', ')})
    VALUES (${values.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${columns.map(([c]) => `${c} = excluded.${c}`).join(', ')},
      updated_at = now()
    WHERE t.account_id = excluded.account_id${scoped}
    RETURNING t.id`;

  return {
    async list(accountId: string, run?: Query) {
      const execute = tenantQueryFor(accountId, run);
      const rows = await execute(`${select} WHERE t.account_id = $1${scoped} ORDER BY ${orderBy}`, [
        accountId,
      ]);
      return rows.map(toTypedRecord);
    },
    get,
    async save(accountId: string, id: string, data: RecordData[T], run?: Query) {
      const execute = tenantQueryFor(accountId, run);
      const fields = data as DataObject;
      const params = columns.map(([, field, kind]) => toParam(kind, fields[field]));
      const saved = await execute(insert, [id, accountId, ...params]);
      return saved.length ? get(accountId, id, execute) : null;
    },
    async remove(accountId: string, id: string) {
      const execute = tenantQueryFor(accountId);
      const rows = await execute(
        `DELETE FROM ${table} t WHERE t.account_id = $1 AND t.id = $2${scoped} RETURNING t.id`,
        [accountId, id],
      );
      return rows.length > 0;
    },
  };
}
