'use client';

import Link from 'next/link';
import { useState } from 'react';
import MoneyModal, {
  type MoneyData,
  type MoneyKind,
  type MoneyRow,
  type SaveMoney,
} from '@/components/money-modal';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import type { Expense, Payment } from '@/lib/types';

export default function FinanceRoute({
  initialPayments,
  initialExpenses,
}: {
  initialPayments: Array<Payment & { id: string }>;
  initialExpenses: Array<Expense & { id: string }>;
}) {
  const { notify, confirm } = useFeedback();
  const [rows, setRows] = useState<MoneyRow[]>([
    ...initialPayments.map((data) => ({ ...data, kind: 'payment' as const })),
    ...initialExpenses.map((data) => ({ ...data, kind: 'expense' as const })),
  ]);
  const [modal, setModal] = useState<MoneyKind | null>(null);
  const [editing, setEditing] = useState<MoneyRow | null>(null);
  const save: SaveMoney = async (kind: MoneyKind, data: MoneyData, id?: string) => {
    try {
      const resource = kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: MoneyData };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o lançamento.');
      const saved = { id: result.record.id, ...result.record.data, kind } as MoneyRow;
      setRows((current) =>
        id ? current.map((row) => (row.id === id ? saved : row)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.',
        'error',
      );
      throw error;
    }
  };
  const create = (kind: MoneyKind) => {
    setEditing(null);
    setModal(kind);
  };
  const edit = (row: MoneyRow) => {
    setEditing(row);
    setModal(row.kind);
  };
  const remove = async (row: MoneyRow) => {
    if (!(await confirm(`Excluir definitivamente o lançamento ${row.description}?`))) return;
    try {
      const resource = row.kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o lançamento.');
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o lançamento.',
        'error',
      );
    }
  };
  const payments = rows.filter((row) => row.kind === 'payment');
  const expenses = rows.filter((row) => row.kind === 'expense');
  const income = payments.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const out = expenses.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const sorted = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const metrics = [
    { title: 'Recebimentos', value: formatMoney(income), detail: 'Entradas registradas' },
    { title: 'Despesas', value: formatMoney(out), detail: 'Saídas registradas' },
    { title: 'Resultado', value: formatMoney(income - out), detail: 'Receita menos despesas' },
    { title: 'Lançamentos', value: String(rows.length), detail: 'No histórico financeiro' },
  ];

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Recebimentos e despesas carregados no servidor."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => create('expense')}
              variant="outline"
            >
              Despesa
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => create('payment')}>
              Recebimento
            </Button>
          </div>
        }
      />

      <section aria-label="Resumo financeiro" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              <p className="text-2xl font-semibold tabular-nums">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {sorted.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Histórico financeiro</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {sorted.map((row) => (
                <article className="grid gap-3 rounded-lg border p-4" key={row.id}>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={row.kind === 'payment' ? 'success' : 'destructive'}>
                      {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                    </Badge>
                    <strong
                      className={
                        row.kind === 'expense'
                          ? 'text-destructive'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {row.kind === 'expense' ? '- ' : '+ '}
                      {formatMoney(row.value)}
                    </strong>
                  </div>
                  <div>
                    <h3 className="font-medium">{row.description}</h3>
                    {row.reference && (
                      <p className="text-sm text-muted-foreground">{row.reference}</p>
                    )}
                  </div>
                  <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                    <span>{row.method}</span>
                    <span>{row.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => edit(row)}
                      size="sm"
                      variant="outline"
                    >
                      Editar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => remove(row)}
                      size="sm"
                      variant="destructive"
                    >
                      Excluir
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant={row.kind === 'payment' ? 'success' : 'destructive'}>
                          {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.description}</p>
                        {row.reference && (
                          <p className="text-xs text-muted-foreground">{row.reference}</p>
                        )}
                      </TableCell>
                      <TableCell>{row.method}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell
                        className={
                          row.kind === 'expense'
                            ? 'font-medium text-destructive'
                            : 'font-medium text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {row.kind === 'expense' ? '- ' : '+ '}
                        {formatMoney(row.value)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button onClick={() => edit(row)} size="sm" variant="outline">
                            Editar
                          </Button>
                          <Button onClick={() => remove(row)} size="sm" variant="destructive">
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Financeiro sem movimentações"
          description="Registre um recebimento ou despesa para iniciar o controle do caixa."
        />
      )}
      {modal && (
        <MoneyModal
          kind={modal}
          item={editing || undefined}
          close={() => setModal(null)}
          save={save}
        />
      )}
    </>
  );
}
