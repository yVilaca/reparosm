const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export const compareText = collator.compare;

export function byName(a: { id: string; name: string }, b: { id: string; name: string }) {
  return compareText(a.name, b.name) || a.id.localeCompare(b.id);
}

export function newestFirst(
  a: { id: string; createdAt?: string },
  b: { id: string; createdAt?: string },
) {
  return (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id);
}

export function cashNewestFirst(
  a: { id: string; date?: string; createdAt?: string },
  b: { id: string; date?: string; createdAt?: string },
) {
  return (b.date || '').localeCompare(a.date || '') || newestFirst(a, b);
}
