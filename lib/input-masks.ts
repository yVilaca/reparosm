const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export function formatPhoneInput(value: unknown): string {
  const input = digits(value).slice(0, 11);
  if (!input) return '';
  if (input.length <= 2) return `(${input}`;
  const number = input.slice(2);
  if (number.length <= 4) return `(${input.slice(0, 2)}) ${number}`;
  if (input.length < 10) return `(${input.slice(0, 2)}) ${number}`;
  const prefixLength = input.length >= 11 ? 5 : 4;
  return number.length > prefixLength
    ? `(${input.slice(0, 2)}) ${number.slice(0, prefixLength)}-${number.slice(prefixLength)}`
    : `(${input.slice(0, 2)}) ${number}`;
}

export function formatDocumentInput(value: unknown): string {
  const input = digits(value).slice(0, 14);
  if (input.length <= 3) return input;
  if (input.length <= 6) return `${input.slice(0, 3)}.${input.slice(3)}`;
  if (input.length <= 9) return `${input.slice(0, 3)}.${input.slice(3, 6)}.${input.slice(6)}`;
  if (input.length <= 11)
    return `${input.slice(0, 3)}.${input.slice(3, 6)}.${input.slice(6, 9)}-${input.slice(9)}`;
  return `${input.slice(0, 2)}.${input.slice(2, 5)}.${input.slice(5, 8)}/${input.slice(8, 12)}-${input.slice(12)}`;
}

function formatDecimalInput(value: unknown): string {
  const source = String(value ?? '').replace(/R\$|\s/g, '');
  if (!source) return '';
  const comma = source.lastIndexOf(',');
  const dot = source.lastIndexOf('.');
  const separatorIndex = Math.max(comma, dot);
  const separator = separatorIndex >= 0 ? source[separatorIndex] : '';
  const fractionSource = separator ? source.slice(separatorIndex + 1) : '';
  const decimal = separator === ',' || (separator === '.' && fractionSource.length <= 2);
  const integerSource = decimal ? source.slice(0, separatorIndex) : source;
  const integerDigits = integerSource.replace(/\D/g, '');
  if (!integerDigits && !fractionSource) return '';
  const integer = (integerDigits.replace(/^0+(?=\d)/, '') || '0').replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '.',
  );
  if (!decimal) return integer;
  const fraction = fractionSource.replace(/\D/g, '').slice(0, 2);
  return `${integer},${fraction}`;
}

export function formatCurrencyInput(value: unknown): string {
  return formatDecimalInput(value);
}

export function formatCurrencyOrPercentInput(value: unknown): string {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (source.endsWith('%')) return `${formatDecimalInput(source.slice(0, -1))}%`;
  return formatCurrencyInput(source);
}

export function formatIntegerInput(value: unknown): string {
  return digits(value);
}

export function formatSignedIntegerInput(value: unknown): string {
  const source = String(value ?? '').trimStart();
  return `${source.startsWith('-') ? '-' : ''}${digits(source).slice(0, 10)}`;
}
