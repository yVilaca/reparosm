'use client';

import Link from 'next/link';
import { useState } from 'react';
import MoneyModal, {
  type MoneyData,
  type MoneyKind,
  type MoneyRow,
  type SaveMoney,
} from '@/components/money-modal';
import { formatMoney } from '@/lib/format';
import type { Expense, Payment } from '@/lib/types';

export default function FinanceRoute({
  initialPayments,
  initialExpenses,
}: {
  initialPayments: Array<Payment & { id: string }>;
  initialExpenses: Array<Expense & { id: string }>;
}) {
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
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.');
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
    if (!confirm(`Excluir definitivamente o lançamento ${row.description}?`)) return;
    try {
      const resource = row.kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o lançamento.');
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir o lançamento.');
    }
  };
  const payments = rows.filter((row) => row.kind === 'payment');
  const expenses = rows.filter((row) => row.kind === 'expense');
  const income = payments.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const out = expenses.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const sorted = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Pagamentos</h1>
          <small>Recebimentos e despesas carregados no servidor.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
          <button type="button" onClick={() => create('expense')}>
            + Despesa
          </button>
          <button className="primary" type="button" onClick={() => create('payment')}>
            + Recebimento
          </button>
        </div>
      </header>
      <div className="metrics">
        <Metric title="Recebimentos" value={formatMoney(income)} detail="Entradas registradas" />
        <Metric title="Despesas" value={formatMoney(out)} detail="Saídas registradas" />
        <Metric
          title="Resultado"
          value={formatMoney(income - out)}
          detail="Receita menos despesas"
        />
        <Metric title="Lançamentos" value={String(rows.length)} detail="No histórico financeiro" />
      </div>
      {sorted.length ? (
        <article className="panel page-panel finance-list">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Forma</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={`tag ${row.kind === 'payment' ? 'ready' : 'red'}`}>
                        {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td>
                      <b>{row.description}</b>
                      <small>{row.reference || ''}</small>
                    </td>
                    <td>{row.method}</td>
                    <td>{row.date}</td>
                    <td className={row.kind === 'expense' ? 'negative-money' : 'positive-money'}>
                      {row.kind === 'expense' ? '- ' : '+ '}
                      {formatMoney(row.value)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => edit(row)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(row)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>Financeiro sem movimentações</h2>
          <p>Registre um recebimento ou despesa para iniciar o controle do caixa.</p>
        </article>
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

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
