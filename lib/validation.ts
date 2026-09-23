import type {
  Automation,
  BusinessRecordType,
  Client,
  DataObject,
  Expense,
  Film,
  Message,
  Order,
  Part,
  Payment,
  Quote,
  RecordData,
  Shop,
  Tutorial,
} from '@/lib/types';

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string };

const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objectValue = (value: unknown): DataObject | null => (isObject(value) ? { ...value } : null);

const stringValue = (data: DataObject, key: string, required = false) => {
  const value = data[key];
  if (value === undefined || value === null) return required ? null : undefined;
  if (typeof value !== 'string' || (required && !value.trim())) return null;
  return value;
};

const numberValue = (data: DataObject, key: string, required = false) => {
  const value = data[key];
  if (value === undefined || value === null || value === '') return required ? null : undefined;
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  data[key] = number;
  return number;
};

const booleanValue = (data: DataObject, key: string, required = false) => {
  const value = data[key];
  if (value === undefined || value === null) return required ? null : undefined;
  return typeof value === 'boolean' ? value : null;
};

const validateStrings = (data: DataObject, keys: string[], required: string[]) => {
  for (const key of keys) {
    if (stringValue(data, key, required.includes(key)) === null) return false;
  }
  return true;
};

const validateNumbers = (data: DataObject, keys: string[], required: string[]) => {
  for (const key of keys) {
    if (numberValue(data, key, required.includes(key)) === null) return false;
  }
  return true;
};

const validateBooleans = (data: DataObject, keys: string[], required: string[]) => {
  for (const key of keys) {
    if (booleanValue(data, key, required.includes(key)) === null) return false;
  }
  return true;
};

const validateOrder = (value: unknown): ValidationResult<Order> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(
      data,
      ['code', 'customer', 'phone', 'device', 'problem'],
      ['code', 'customer', 'device'],
    )
  )
    return { ok: false, error: 'Ordem inválida.' };
  if (!validateNumbers(data, ['labor', 'parts', 'cost', 'total', 'profit', 'warrantyDays'], []))
    return { ok: false, error: 'Valores da ordem inválidos.' };
  if (!validateBooleans(data, ['whatsappConsent'], []))
    return { ok: false, error: 'Consentimento inválido.' };
  if (
    data.pattern !== undefined &&
    (!Array.isArray(data.pattern) || !data.pattern.every((item) => Number.isInteger(item)))
  )
    return { ok: false, error: 'Padrão da ordem inválido.' };
  return { ok: true, data: data as Order };
};

const validateQuote = (value: unknown): ValidationResult<Quote> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(
      data,
      ['code', 'customer', 'phone', 'device', 'problem', 'service'],
      ['customer', 'phone', 'device', 'service'],
    )
  )
    return { ok: false, error: 'Orçamento inválido.' };
  if (!validateNumbers(data, ['labor', 'parts', 'total'], []))
    return { ok: false, error: 'Valores do orçamento inválidos.' };
  return { ok: true, data: data as Quote };
};

const validatePart = (value: unknown): ValidationResult<Part> => {
  const data = objectValue(value);
  if (!data || !validateStrings(data, ['name', 'category', 'cost', 'sku', 'image'], ['name']))
    return { ok: false, error: 'Produto inválido.' };
  if (!validateNumbers(data, ['stock', 'cost', 'price'], ['stock', 'price']))
    return { ok: false, error: 'Valores do produto inválidos.' };
  if (!validateBooleans(data, ['published'], []))
    return { ok: false, error: 'Publicação inválida.' };
  return { ok: true, data: data as Part };
};

const validateFilm = (value: unknown): ValidationResult<Film> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(
      data,
      ['brand', 'model', 'compatible', 'size'],
      ['brand', 'model', 'compatible'],
    )
  )
    return { ok: false, error: 'Compatibilidade inválida.' };
  return { ok: true, data: data as Film };
};

const validateClient = (value: unknown): ValidationResult<Client> => {
  const data = objectValue(value);
  if (!data || !validateStrings(data, ['name', 'phone'], ['name', 'phone']))
    return { ok: false, error: 'Cliente inválido.' };
  if (!validateBooleans(data, ['vip', 'automatic'], []))
    return { ok: false, error: 'Preferências do cliente inválidas.' };
  return { ok: true, data: data as Client };
};

const validateMoneyRecord = <T extends Payment | Expense>(
  value: unknown,
  label: string,
): ValidationResult<T> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(data, ['description', 'method', 'date', 'createdAt'], ['description'])
  )
    return { ok: false, error: `${label} inválida.` };
  if (!validateNumbers(data, ['value'], ['value']))
    return { ok: false, error: `Valor de ${label.toLowerCase()} inválido.` };
  return { ok: true, data: data as T };
};

const validateAutomation = (value: unknown): ValidationResult<Automation> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(data, ['name', 'schedule', 'message'], ['name', 'schedule', 'message'])
  )
    return { ok: false, error: 'Automação inválida.' };
  if (!validateBooleans(data, ['enabled'], ['enabled']))
    return { ok: false, error: 'Estado da automação inválido.' };
  return { ok: true, data: data as Automation };
};

const validateMessage = (value: unknown): ValidationResult<Message> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(
      data,
      [
        'orderId',
        'customer',
        'phone',
        'kind',
        'message',
        'status',
        'providerId',
        'error',
        'sentAt',
      ],
      ['customer', 'phone', 'kind', 'message', 'status'],
    )
  )
    return { ok: false, error: 'Mensagem inválida.' };
  return { ok: true, data: data as Message };
};

const validateTutorial = (value: unknown): ValidationResult<Tutorial> => {
  const data = objectValue(value);
  if (
    !data ||
    !validateStrings(
      data,
      ['title', 'url', 'category', 'description', 'createdAt'],
      ['title', 'url'],
    )
  )
    return { ok: false, error: 'Tutorial inválido.' };
  return { ok: true, data: data as Tutorial };
};

const validateShop = (value: unknown): ValidationResult<Shop> => {
  const data = objectValue(value);
  if (!data || !validateStrings(data, ['name', 'phone'], ['name', 'phone']))
    return { ok: false, error: 'Assistência inválida.' };
  return { ok: true, data: data as Shop };
};

const validators: Record<
  BusinessRecordType,
  (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>
> = {
  order: validateOrder as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  quote: validateQuote as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  part: validatePart as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  shop: validateShop as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  film: validateFilm as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  client: validateClient as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  payment: (value) => validateMoneyRecord<Payment>(value, 'Recebimento'),
  expense: (value) => validateMoneyRecord<Expense>(value, 'Despesa'),
  automation: validateAutomation as (
    value: unknown,
  ) => ValidationResult<RecordData[BusinessRecordType]>,
  message: validateMessage as (value: unknown) => ValidationResult<RecordData[BusinessRecordType]>,
  tutorial: validateTutorial as (
    value: unknown,
  ) => ValidationResult<RecordData[BusinessRecordType]>,
};

export function validateRecord<T extends BusinessRecordType>(
  type: T,
  value: unknown,
): ValidationResult<RecordData[T]>;
export function validateRecord(
  type: string,
  value: unknown,
): ValidationResult<RecordData[BusinessRecordType]>;
export function validateRecord(
  type: string,
  value: unknown,
): ValidationResult<RecordData[BusinessRecordType]> {
  const validator = validators[type as BusinessRecordType];
  return validator ? validator(value) : { ok: false, error: 'Tipo de registro inválido.' };
}
