// Tables whose columns map one-to-one onto record fields.
import { simpleRepo } from '@/lib/repos/simple';

export const parts = simpleRepo({
  type: 'part',
  table: 'parts',
  columns: [
    ['name', 'name', 'required'],
    ['category', 'category', 'text'],
    ['sku', 'sku', 'text'],
    ['stock', 'stock', 'integer'],
    ['cost', 'cost', 'money'],
    ['price', 'price', 'money'],
    ['published', 'published', 'boolean'],
    ['image', 'image', 'text'],
  ],
});

const cashColumns = [
  ['description', 'description', 'required'],
  ['reference', 'reference', 'text'],
  ['value', 'value', 'money'],
  ['method', 'method', 'text'],
  ['date', 'date', 'date'],
] as const;

export const payments = simpleRepo({
  type: 'payment',
  table: 'cash_entries',
  columns: cashColumns,
  scope: ['kind', 'in'],
});

export const expenses = simpleRepo({
  type: 'expense',
  table: 'cash_entries',
  columns: cashColumns,
  scope: ['kind', 'out'],
});

export const messages = simpleRepo({
  type: 'message',
  table: 'messages',
  columns: [
    ['order_id', 'orderId', 'order'],
    ['customer', 'customer', 'required'],
    ['phone', 'phone', 'required'],
    ['kind', 'kind', 'required'],
    ['message', 'message', 'required'],
    ['status', 'status', 'required'],
    ['provider_id', 'providerId', 'text'],
    ['error', 'error', 'text'],
    ['sent_at', 'sentAt', 'timestamp'],
  ],
});

export const films = simpleRepo({
  type: 'film',
  table: 'films',
  columns: [
    ['brand', 'brand', 'required'],
    ['model', 'model', 'required'],
    ['compatible', 'compatible', 'required'],
    ['size', 'size', 'text'],
  ],
});

export const automations = simpleRepo({
  type: 'automation',
  table: 'automations',
  columns: [
    ['name', 'name', 'required'],
    ['schedule', 'schedule', 'required'],
    ['message', 'message', 'required'],
    ['enabled', 'enabled', 'boolean'],
  ],
});

export const tutorials = simpleRepo({
  type: 'tutorial',
  table: 'tutorials',
  columns: [
    ['title', 'title', 'required'],
    ['url', 'url', 'required'],
    ['category', 'category', 'text'],
    ['description', 'description', 'text'],
  ],
});
