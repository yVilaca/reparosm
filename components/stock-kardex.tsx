'use client';

import { useEffect, useRef, useState } from 'react';
import type { PartRow } from '@/components/part-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { todayInSaoPaulo } from '@/lib/warranty';

type Movement = {
  id: string;
  partId: string;
  name: string;
  sku: string;
  source: string;
  reference: string;
  referenceId: string;
  quantity: number;
  before: number;
  after: number;
  unitCost: number;
  createdAt: string;
};
type Cursor = { createdAt: string; id: string };
type KardexFilters = {
  from: string;
  to: string;
  partId: string;
  source: string;
  direction: string;
  search: string;
};
type MovementPage = { rows: Movement[]; nextCursor: Cursor | null };
const sources: Record<string, string> = {
  opening: 'Saldo inicial',
  adjustment: 'Ajuste',
  'quick-sale': 'Venda de balcão',
  'sale-reversal': 'Estorno de venda',
  order: 'Ordem de serviço',
  'order-return': 'Devolução de OS',
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const quantity = (value: number) => `${value > 0 ? '+' : ''}${value}`;

export async function loadStockMovements(
  filters: KardexFilters,
  cursor?: Cursor | null,
  signal?: AbortSignal,
): Promise<MovementPage> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(filters.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(filters.to) ||
    filters.from > filters.to
  )
    throw new Error('Informe um intervalo de datas válido.');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  if (cursor) {
    query.set('before', cursor.createdAt);
    query.set('beforeId', cursor.id);
  }
  const response = await fetch(`/api/stock/movements?${query}`, { signal });
  const result = (await response.json()) as MovementPage & { error?: string };
  if (!response.ok || !Array.isArray(result.rows))
    throw new Error(result.error || 'Não foi possível carregar o Kardex.');
  return result;
}

export function StockMovementRows({ rows }: { rows: Movement[] }) {
  return (
    <>
      <ul className="grid gap-3 md:hidden" aria-label="Movimentações de estoque">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-2 rounded-lg border p-4 text-sm">
            <div>
              <p className="font-semibold">{row.name}</p>
              <p className="text-muted-foreground">
                {row.sku || 'Sem SKU'} · {dateTime(row.createdAt)}
              </p>
            </div>
            <p>
              {sources[row.source] || row.source} · {row.reference || '—'}
            </p>
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt>Movimento</dt>
                <dd className="font-semibold">
                  {row.quantity > 0 ? 'Entrada' : 'Saída'} {quantity(row.quantity)} un.
                </dd>
              </div>
              <div>
                <dt>Saldo</dt>
                <dd>
                  {row.before} → {row.after}
                </dd>
              </div>
              <div>
                <dt>Custo unitário</dt>
                <dd>{formatMoney(row.unitCost)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                'Data',
                'Produto / SKU',
                'Origem',
                'Referência',
                'Movimento',
                'Saldo',
                'Custo unitário',
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{dateTime(row.createdAt)}</TableCell>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.sku || '—'}</p>
                </TableCell>
                <TableCell>{sources[row.source] || row.source}</TableCell>
                <TableCell>{row.reference || '—'}</TableCell>
                <TableCell className="tabular-nums">
                  {row.quantity > 0 ? 'Entrada' : 'Saída'} {quantity(row.quantity)} un.
                </TableCell>
                <TableCell className="tabular-nums">
                  {row.before} → {row.after}
                </TableCell>
                <TableCell className="tabular-nums">{formatMoney(row.unitCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function StockKardex({ parts }: { parts: PartRow[] }) {
  const [filters, setFilters] = useState<KardexFilters>(() => {
    const today = todayInSaoPaulo();
    return {
      from: `${today.slice(0, 7)}-01`,
      to: today,
      partId: '',
      source: '',
      direction: '',
      search: '',
    };
  });
  const [rows, setRows] = useState<Movement[]>([]);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [request, setRequest] = useState<{ cursor: Cursor | null; revision: number }>({
    cursor: null,
    revision: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = ++requestId.current;
    void loadStockMovements(filters, request.cursor, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setRows((current) => (request.cursor ? [...current, ...page.rows] : page.rows));
        setNextCursor(page.nextCursor);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && id === requestId.current)
          setError(
            failure instanceof Error ? failure.message : 'Não foi possível carregar o Kardex.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, request]);

  const change = (key: keyof KardexFilters, value: string) => {
    controllerRef.current?.abort();
    ++requestId.current;
    setFilters((current) => ({ ...current, [key]: value }));
    setRows([]);
    setNextCursor(null);
    setError('');
    setLoading(true);
    setRequest((current) => ({ cursor: null, revision: current.revision + 1 }));
  };
  const load = (cursor: Cursor | null) => {
    setLoading(true);
    setError('');
    setRequest((current) => ({ cursor, revision: current.revision + 1 }));
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kardex</CardTitle>
        <p className="text-sm text-muted-foreground">
          Entradas e saídas de estoque, com o saldo antes e depois de cada movimento.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <section
          aria-label="Filtros do Kardex"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="grid min-w-0 gap-1 text-sm">
            De
            <Input
              type="date"
              required
              max={filters.to || undefined}
              value={filters.from}
              onChange={(event) => change('from', event.target.value)}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Até
            <Input
              type="date"
              required
              min={filters.from || undefined}
              value={filters.to}
              onChange={(event) => change('to', event.target.value)}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Produto
            <select
              className="h-9 w-full min-w-0 rounded-md border bg-background px-3"
              value={filters.partId}
              onChange={(event) => change('partId', event.target.value)}
            >
              <option value="">Todos os produtos</option>
              {parts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name}
                  {part.sku ? ` · ${part.sku}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Origem
            <select
              className="h-9 w-full min-w-0 rounded-md border bg-background px-3"
              value={filters.source}
              onChange={(event) => change('source', event.target.value)}
            >
              <option value="">Todas as origens</option>
              {Object.entries(sources).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Direção
            <select
              className="h-9 w-full min-w-0 rounded-md border bg-background px-3"
              value={filters.direction}
              onChange={(event) => change('direction', event.target.value)}
            >
              <option value="">Entradas e saídas</option>
              <option value="in">Entradas</option>
              <option value="out">Saídas</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Buscar nome ou SKU
            <Input
              type="search"
              value={filters.search}
              onChange={(event) => change('search', event.target.value)}
              placeholder="Nome ou SKU"
            />
          </label>
        </section>
        <p className="text-sm text-muted-foreground">
          Período: {filters.from.split('-').reverse().join('/')} a{' '}
          {filters.to.split('-').reverse().join('/')}
        </p>
        {rows.length > 0 && <StockMovementRows rows={rows} />}
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p>{error}</p>
            <Button disabled={loading} onClick={() => load(request.cursor)} variant="outline">
              Tentar novamente
            </Button>
          </div>
        )}
        {loading && (
          <p role="status" aria-live="polite">
            Carregando movimentações…
          </p>
        )}
        {!loading && !error && !rows.length && (
          <p role="status">Nenhuma movimentação encontrada neste período e filtros.</p>
        )}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{rows.length} movimentações carregadas</p>
            {nextCursor && (
              <Button disabled={loading} onClick={() => load(nextCursor)} variant="outline">
                Carregar mais
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
