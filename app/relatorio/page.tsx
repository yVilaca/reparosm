'use client';
import { useEffect, useState } from 'react';
import { formatMoney as money } from '@/lib/format';
import type { DataObject, StoredRecord } from '@/lib/types';
export default function Relatorio() {
  const [records, setRecords] = useState<StoredRecord[]>([]);
  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((x: { records?: StoredRecord[] }) => setRecords(x.records || []));
  }, []);
  const by = (t: string): DataObject[] => records.filter((r) => r.type === t).map((r) => r.data),
    clients = by('client'),
    orders = by('order'),
    payments = by('payment'),
    expenses = by('expense'),
    parts = by('part'),
    quotes = by('quote'),
    income = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    out = expenses.reduce((s, p) => s + Number(p.value || 0), 0);
  return (
    <main className="report-page">
      <header>
        <div>
          <span>REPAROSM</span>
          <h1>Relatório geral da assistência</h1>
          <p>Gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>
        <button onClick={() => window.print()}>Salvar como PDF</button>
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
          <b>{parts.reduce((s, p) => s + Number(p.stock || 0), 0)}</b>
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
              {columns.map((c) => (
                <th key={c[1]}>{c[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map(([, key]) => (
                  <td key={key}>{r[key] == null ? '—' : String(r[key])}</td>
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
