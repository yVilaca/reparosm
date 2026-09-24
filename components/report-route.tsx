'use client';

import { formatMoney as money } from '@/lib/format';
import type { DataObject, StoredRecord } from '@/lib/types';

export default function ReportRoute({ initialRecords }: { initialRecords: StoredRecord[] }) {
  const records = initialRecords;
  const by = (type: string): DataObject[] =>
    records.filter((record) => record.type === type).map((record) => record.data);
  const clients = by('client');
  const orders = by('order');
  const payments = by('payment');
  const expenses = by('expense');
  const parts = by('part');
  const quotes = by('quote');
  const income = payments.reduce((sum, payment) => sum + Number(payment.value || 0), 0);
  const out = expenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);

  return (
    <main className="report-page">
      <header>
        <div>
          <span>REPAROSM</span>
          <h1>Relatório geral da assistência</h1>
          <p>Gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>
        <button type="button" onClick={() => window.print()}>
          Salvar como PDF
        </button>
      </header>
      <section className="report-metrics">
        <div>
          <span>Receita</span>
          <b>{money(income)}</b>
        </div>
        <div>
          <span>Despesas</span>
          <b>{money(out)}</b>
        </div>
        <div>
          <span>Resultado</span>
          <b>{money(income - out)}</b>
        </div>
        <div>
          <span>Ordens</span>
          <b>{orders.length}</b>
        </div>
        <div>
          <span>Clientes</span>
          <b>{clients.length}</b>
        </div>
        <div>
          <span>Itens em estoque</span>
          <b>{parts.reduce((sum, part) => sum + Number(part.stock || 0), 0)}</b>
        </div>
      </section>
      <Report
        title="Ordens de serviço"
        rows={orders}
        columns={[
          ['Código', 'code'],
          ['Cliente', 'customer'],
          ['Aparelho', 'device'],
          ['Etapa', 'stage'],
          ['Total', 'total'],
        ]}
      />
      <Report
        title="Clientes"
        rows={clients}
        columns={[
          ['Nome', 'name'],
          ['WhatsApp', 'phone'],
          ['E-mail', 'email'],
          ['Status', 'status'],
        ]}
      />
      <Report
        title="Recebimentos"
        rows={payments}
        columns={[
          ['Descrição', 'description'],
          ['Forma', 'method'],
          ['Data', 'date'],
          ['Valor', 'value'],
        ]}
      />
      <Report
        title="Despesas"
        rows={expenses}
        columns={[
          ['Descrição', 'description'],
          ['Forma', 'method'],
          ['Data', 'date'],
          ['Valor', 'value'],
        ]}
      />
      <Report
        title="Estoque"
        rows={parts}
        columns={[
          ['Produto', 'name'],
          ['Categoria', 'category'],
          ['Quantidade', 'stock'],
          ['Custo', 'cost'],
          ['Venda', 'price'],
        ]}
      />
      <Report
        title="Orçamentos"
        rows={quotes}
        columns={[
          ['Código', 'code'],
          ['Cliente', 'customer'],
          ['Aparelho', 'device'],
          ['Status', 'status'],
          ['Total', 'total'],
        ]}
      />
    </main>
  );
}

function Report({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: DataObject[];
  columns: Array<[string, string]>;
}) {
  return (
    <section className="report-section">
      <h2>
        {title} <small>{rows.length}</small>
      </h2>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column[1]}>{column[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map(([, key]) => (
                  <td key={key}>{row[key] == null ? '—' : String(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nenhum registro.</p>
      )}
    </section>
  );
}
