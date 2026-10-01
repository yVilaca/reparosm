'use client';

import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/brand-logo';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const metrics = [
    { title: 'Receita', value: money(income) },
    { title: 'Despesas', value: money(out) },
    { title: 'Resultado', value: money(income - out) },
    { title: 'Ordens', value: String(orders.length) },
    { title: 'Clientes', value: String(clients.length) },
    {
      title: 'Itens em estoque',
      value: String(parts.reduce((sum, part) => sum + Number(part.stock || 0), 0)),
    },
  ];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 print:max-w-none print:bg-white print:p-0 print:text-black print:[--background:white] print:[--foreground:black] print:[--card:white] print:[--card-foreground:black] print:[--muted-foreground:#404040] print:[--border:#bdbdbd] print:[--ui-muted:#f5f5f5]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <BrandLogo className="mb-2 w-[118px]" sizes="118px" />
          <h1 className="text-xl font-semibold">Relatório geral da assistência</h1>
          <p className="text-sm text-muted-foreground">
            Gerado em {new Date().toLocaleString('pt-BR')}
          </p>
        </div>
        <Button className="print:hidden" onClick={() => window.print()} type="button">
          Salvar como PDF
        </Button>
      </header>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              <p className="text-lg font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
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
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border print:overflow-visible print:rounded-none print:border-0">
          <Table className="print:table-fixed" containerClassName="print:overflow-visible">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead className="print:whitespace-normal" key={column[1]}>
                    {column[0]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map(([, key]) => (
                    <TableCell className="print:break-words print:whitespace-normal" key={key}>
                      {row[key] == null ? '—' : String(row[key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum registro.</p>
      )}
    </section>
  );
}
