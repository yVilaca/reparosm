export const MAX_PRINT_COPIES = 10;
export const MAX_PRINT_ORDERS = 100;
export type PrintLayout = 'compact' | 'full';

export function normalizePrintLayout(value?: string | string[]): PrintLayout {
  return (Array.isArray(value) ? value[0] : value) === 'compact' ? 'compact' : 'full';
}

export function parsePrintOrderIds(value?: string | string[]) {
  const ids = [
    ...new Set((Array.isArray(value) ? value : value ? [value] : []).map((id) => id.trim())),
  ];
  if (!ids.length || ids.length > MAX_PRINT_ORDERS || ids.some((id) => !id || id.length > 128))
    return null;
  return ids;
}

export function orderPrintUrl(ids: string[], layout: PrintLayout = 'full') {
  const selection = parsePrintOrderIds(ids);
  if (!selection) return null;
  if (selection.length === 1)
    return `/ordens/${encodeURIComponent(selection[0])}/imprimir${layout === 'compact' ? '?layout=compact' : ''}`;
  const query = new URLSearchParams();
  selection.forEach((id) => query.append('id', id));
  if (layout === 'compact') query.set('layout', layout);
  return `/ordens/imprimir?${query}`;
}

export function normalizePrintCopies(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const copies = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(copies)) return 1;
  return Math.min(MAX_PRINT_COPIES, Math.max(1, copies));
}
