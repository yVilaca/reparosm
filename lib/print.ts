export const MAX_PRINT_COPIES = 10;

export function normalizePrintCopies(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const copies = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(copies)) return 1;
  return Math.min(MAX_PRINT_COPIES, Math.max(1, copies));
}
