// Conversions between Postgres rows and the { id, type, data } records the frontend expects.
import type { DataObject, StoredRecord } from '@/lib/types';

export type Timestamp = string | Date;

export const iso = (value: Timestamp) => new Date(value).toISOString();

/** pg returns numeric columns as strings. */
export const money = (value: unknown) => Number(value ?? 0);

/** A 'YYYY-MM-DD' string, or null for anything else (including ''). */
export const dateOrNull = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/** Optional text column: '' and non-strings become null. */
export const textOrNull = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

/** Drops null/undefined fields so optional values stay absent, as they were in JSON. */
export const compact = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== undefined),
  );

export const toRecord = <T extends StoredRecord['type']>(type: T, id: string, data: DataObject) =>
  ({ id, type, data }) as StoredRecord<T>;
