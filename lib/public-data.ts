import type { DataObject, StoredRecord } from '@/lib/types';

// Explicit public fields: never serialize inventory costs, margins, credentials or internal notes.
const fields = (data: unknown, keys: readonly string[]): DataObject => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const source = data as DataObject;
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
};

export function publicRecord(record: StoredRecord) {
  const keys: Record<string, readonly string[]> = {
    part: ['name', 'category', 'price', 'stock', 'published', 'image'],
    shop: ['name', 'phone', 'address', 'description', 'logo'],
    quote: [
      'code',
      'customer',
      'device',
      'problem',
      'service',
      'notes',
      'total',
      'validUntil',
      'status',
    ],
  };
  return { id: record.id, type: record.type, data: fields(record.data, keys[record.type] || []) };
}
export const businessTypes: string[] = [
  'order',
  'quote',
  'part',
  'shop',
  'film',
  'client',
  'payment',
  'expense',
  'automation',
  'message',
  'tutorial',
];
