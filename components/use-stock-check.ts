'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type StockItem = { partId: string; quantity: number };
export type StockCheck = {
  allowNegativeStock: boolean;
  parts: { id: string; name: string; stock: number; available: number }[];
};
export type StockShortage = { id: string; name: string; available: number; quantity: number };

export function stockShortages(items: StockItem[], check: StockCheck): StockShortage[] {
  const quantities = new Map<string, number>();
  for (const item of items)
    quantities.set(item.partId, (quantities.get(item.partId) || 0) + item.quantity);
  return [...quantities].flatMap(([id, quantity]) => {
    const part = check.parts.find((part) => part.id === id);
    return part && quantity > part.available
      ? [{ id, name: part.name, available: part.available, quantity }]
      : [];
  });
}

export function uniqueStockProduct<T extends { id: string; name: string; sku?: string }>(
  products: T[],
  description: string,
): T | null {
  const normalize = (text: string) => text.trim().toLocaleLowerCase('pt-BR');
  const wanted = normalize(description);
  if (!wanted) return null;
  const matches = products.filter(
    (part) => normalize(part.name) === wanted || (part.sku && normalize(part.sku) === wanted),
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function requestStock(
  items: StockItem[],
  orderId?: string,
  signal?: AbortSignal,
): Promise<StockCheck> {
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1))
    throw new Error('Informe quantidades inteiras maiores que zero.');
  const ids = [...new Set(items.map((item) => item.partId))].sort();
  if (ids.length > 100) throw new Error('Selecione até 100 produtos por vez.');
  const query = new URLSearchParams({ ids: ids.join(',') });
  if (orderId) query.set('orderId', orderId);
  const response = await fetch(`/api/stock?${query}`, { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível verificar o estoque.');
  if (
    typeof result.allowNegativeStock !== 'boolean' ||
    !Array.isArray(result.parts) ||
    result.parts.some(
      (part: StockCheck['parts'][number]) =>
        !part ||
        typeof part.id !== 'string' ||
        typeof part.name !== 'string' ||
        !Number.isFinite(part.stock) ||
        !Number.isFinite(part.available),
    ) ||
    ids.some((id) => !result.parts.some((part: StockCheck['parts'][number]) => part.id === id))
  )
    throw new Error('O estoque mudou. Revise os produtos e tente novamente.');
  return result as StockCheck;
}

export function useStockCheck(items: StockItem[], orderId?: string) {
  const key = JSON.stringify([
    orderId,
    items.map(({ partId, quantity }) => ({ partId, quantity })),
  ]);
  const latest = useRef(key);
  const controller = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolver = useRef<((approved: boolean) => void) | null>(null);
  const [state, setState] = useState<{
    key: string;
    check?: StockCheck;
    error?: string;
    checking: boolean;
  }>({ key: '', checking: false });
  const [alert, setAlert] = useState<{
    key: string;
    check: StockCheck;
    shortages: StockShortage[];
  } | null>(null);
  const decide = useCallback((approved: boolean) => {
    resolver.current?.(approved);
    resolver.current = null;
    setAlert(null);
  }, []);
  const refresh = useCallback(async () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState((previous) => ({ ...previous, key, error: undefined, checking: true }));
    const [id, basket] = JSON.parse(key) as [string | undefined, StockItem[]];
    try {
      const check = await requestStock(basket, id, current.signal);
      if (current.signal.aborted || latest.current !== key) return null;
      setState({ key, check, checking: false });
      return check;
    } catch (error) {
      if (current.signal.aborted || latest.current !== key) return null;
      setState({
        key,
        checking: false,
        error: error instanceof Error ? error.message : 'Não foi possível verificar o estoque.',
      });
      return null;
    }
  }, [key]);
  useEffect(() => {
    latest.current = key;
    debounce.current = setTimeout(() => void refresh(), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = null;
      controller.current?.abort();
      resolver.current?.(false);
      resolver.current = null;
    };
  }, [key, refresh]);
  const confirm = async (): Promise<{ acknowledgeNegativeStock?: true } | null> => {
    if (!items.length) return {};
    const check = await refresh();
    if (!check) return null;
    const shortages = stockShortages(items, check);
    if (!shortages.length) return {};
    const approved = await new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setAlert({ key, check, shortages });
    });
    return approved ? { acknowledgeNegativeStock: true } : null;
  };
  return {
    check: state.key === key ? state.check : undefined,
    checking: items.length > 0 && (state.key !== key || state.checking),
    error: items.length > 0 && state.key === key ? state.error : undefined,
    shortages: state.key === key && state.check ? stockShortages(items, state.check) : [],
    refresh,
    confirm,
    alert: alert?.key === key ? alert : null,
    decide,
  };
}
