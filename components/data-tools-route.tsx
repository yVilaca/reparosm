'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BusinessRecordType, DataObject, StoredRecord } from '@/lib/types';

const labels: Partial<Record<BusinessRecordType, string>> = {
  client: 'Clientes',
  order: 'Ordens de serviço',
  payment: 'Recebimentos',
  expense: 'Despesas',
  part: 'Estoque',
  quote: 'Orçamentos',
  film: 'Películas',
};

const resources: Record<BusinessRecordType, string> = {
  client: 'clients',
  order: 'orders',
  payment: 'payments',
  expense: 'expenses',
  part: 'parts',
  quote: 'quotes',
  film: 'films',
  shop: 'shops',
  automation: 'automations',
  message: 'messages',
  tutorial: 'tutorials',
};

const parseCsv = (line: string) =>
  line
    .split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.replace(/^"|"$/g, '').replaceAll('""', '"'));

export default function DataToolsRoute({ records }: { records: StoredRecord[] }) {
  const { notify } = useFeedback();
  const [type, setType] = useState<BusinessRecordType>('client');
  const save = async (recordType: BusinessRecordType, data: DataObject) => {
    const response = await fetch(`/api/${resources[recordType]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar o registro.');
  };
  const csv = (kind: BusinessRecordType) => {
    const rows = records
      .filter((record) => record.type === kind)
      .map((record) => ({ id: record.id, ...record.data }) as DataObject & { id: string });
    if (!rows.length) {
      notify(`Não há ${(labels[kind] || 'registros').toLowerCase()} para exportar.`, 'info');
      return;
    }
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const escape = (value: unknown) =>
      `"${String(Array.isArray(value) ? value.join(' | ') : (value ?? '')).replaceAll('"', '""')}"`;
    const content =
      '\uFEFF' +
      [keys.join(';'), ...rows.map((row) => keys.map((key) => escape(row[key])).join(';'))].join(
        '\n',
      );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = `reparosm-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const lines = String(reader.result || '')
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter(Boolean);
        if (!lines.length) throw new Error('O arquivo CSV está vazio.');
        const headers = parseCsv(lines[0]);
        for (const line of lines.slice(1)) {
          const values = parseCsv(line);
          const data: DataObject = {};
          headers.forEach((header, index) => {
            if (header !== 'id') data[header] = values[index] || '';
          });
          await save(type, data);
        }
        notify(`${Math.max(0, lines.length - 1)} registros importados.`, 'success');
      } catch (error) {
        notify(
          error instanceof Error ? error.message : 'Não foi possível importar o CSV.',
          'error',
        );
      }
    };
    reader.onerror = () => notify('Não foi possível ler o arquivo CSV.', 'error');
    reader.readAsText(file, 'utf-8');
  };
  return (
    <>
      <PageHeader
        title="Dados & exportação"
        description="Exporte, importe e preserve os dados da assistência."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <Card className="mb-4 gap-3 bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Central de dados
            </p>
            <h2 className="text-lg font-semibold">Exportar, importar e gerar relatórios</h2>
            <p className="text-sm opacity-90">
              Exporte cópias, importe planilhas CSV e gere o relatório completo da loja.
            </p>
          </div>
          <Button onClick={() => window.open('/relatorio', '_blank')} size="sm" variant="secondary">
            Gerar relatório PDF ↗
          </Button>
        </CardContent>
      </Card>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(labels).map(([kind, label]) => (
          <Card key={kind}>
            <CardContent className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">ARQUIVO CSV</span>
              <h3 className="font-semibold">{String(label)}</h3>
              <p className="text-sm text-muted-foreground">
                {records.filter((record) => record.type === kind).length} registros disponíveis
              </p>
              <Button onClick={() => csv(kind as BusinessRecordType)} size="sm" variant="outline">
                Baixar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Importar arquivo CSV</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use ponto e vírgula como separador. A primeira linha deve conter os nomes dos campos.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="data-tools-type">Tipo de registro</Label>
            <Select onValueChange={(value) => setType(value as BusinessRecordType)} value={type}>
              <SelectTrigger className="w-full" id="data-tools-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(labels).map(([kind, label]) => (
                  <SelectItem key={kind} value={kind}>
                    {String(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="data-tools-file">Selecionar CSV</Label>
            <Button asChild className="w-fit" variant="outline">
              <label className="cursor-pointer" htmlFor="data-tools-file">
                Escolher arquivo
                <input
                  accept=".csv,text/csv"
                  className="sr-only"
                  id="data-tools-file"
                  onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])}
                  type="file"
                />
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
