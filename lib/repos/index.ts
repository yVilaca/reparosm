import type { Query } from '@/lib/db';
import * as clients from '@/lib/repos/clients';
import * as orders from '@/lib/repos/orders';
import * as quotes from '@/lib/repos/quotes';
import * as shops from '@/lib/repos/shops';
import type { BusinessRecordType, RecordData, StoredRecord } from '@/lib/types';

/** Business types stored in their own table, all scoped by account. */
export type TableRepo<T extends BusinessRecordType = BusinessRecordType> = {
  list(accountId: string): Promise<StoredRecord<T>[]>;
  get(accountId: string, id: string, run?: Query): Promise<StoredRecord<T> | null>;
  /** null when the id belongs to another account. */
  save(
    accountId: string,
    id: string,
    data: RecordData[T],
    run?: Query,
  ): Promise<StoredRecord<T> | null>;
  remove(accountId: string, id: string): Promise<boolean>;
};

export const tableRepos: { [T in BusinessRecordType]?: TableRepo<T> } = {
  shop: shops,
  client: clients,
  quote: quotes,
  order: orders,
};

export const repoFor = (type: string) =>
  (tableRepos as Record<string, TableRepo | undefined>)[type];

export { clients, orders, quotes, shops };
