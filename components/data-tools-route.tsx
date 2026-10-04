'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import IconChip from '@/components/ui/icon-chip';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import SoftBanner from '@/components/ui/soft-banner';
import type { Tone } from '@/components/ui/tone';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  Download,
  FileBarChart,
  Package,
  Smartphone,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
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

// Entradas e saídas seguem a regra de cor do dinheiro; o resto fica neutro.
const looks: Partial<Record<BusinessRecordType, { icon: LucideIcon; tone: Tone }>> = {
  client: { icon: Users, tone: 'neutral' },
  order: { icon: Wrench, tone: 'neutral' },
  payment: { icon: ArrowDownLeft, tone: 'success' },
  expense: { icon: ArrowUpRight, tone: 'danger' },
  part: { icon: Package, tone: 'neutral' },
  quote: { icon: ClipboardList, tone: 'neutral' },
  film: { icon: Smartphone, tone: 'neutral' },
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

export type ExportCounts = Partial<Record<BusinessRecordType, number>>;

export async function loadExportRecords(kind: BusinessRecordType): Promise<StoredRecord[]> {
  const response = await fetch(`/api/${resources[kind]}`, { cache: 'no-store' });
  const result = (await response.json()) as { records?: StoredRecord[]; error?: string };
  if (!response.ok || !Array.isArray(result.records))
    throw new Error(result.error || 'Não foi possível carregar os dados para exportar.');
  if (kind !== 'film') return result.records;
  const { filmCatalog } = await import('@/lib/film-catalog');
  return [
    ...result.records,
    ...filmCatalog.map((record) => ({ ...record, type: 'film' as const })),
  ];
}

export default function DataToolsRoute({ counts }: { counts: ExportCounts }) {
  const { notify } = useFeedback();
  const [type, setType] = useState<BusinessRecordType>('client');
  const [exporting, setExporting] = useState<BusinessRecordType | null>(null);
  const save = async (recordType: BusinessRecordType, data: DataObject) => {
    const response = await fetch(`/api/${resources[recordType]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar o registro.');
  };
  const csv = async (kind: BusinessRecordType) => {
    if (exporting) return;
    setExporting(kind);
    try {
      const rows = (await loadExportRecords(kind)).map(
        (record) => ({ id: record.id, ...record.data }) as DataObject & { id: string },
      );
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
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível exportar os dados.',
        'error',
      );
    } finally {
      setExporting(null);
    }
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
      />
      <SoftBanner
        action={
          <Button onClick={() => window.open('/relatorio', '_blank')} size="sm" variant="outline">
            <FileBarChart aria-hidden="true" />
            Gerar relatório PDF
          </Button>
        }
        className="mb-6"
        description="Tudo da loja num documento só, pronto para imprimir ou guardar."
        icon={FileBarChart}
        title="Relatório completo da loja"
      />
      <div className="mb-6">
        <ListGroup hint="Abre no Excel ou no Google Planilhas" title="Baixar planilhas (CSV)">
          {Object.entries(labels).map(([kind, label]) => {
            const look = looks[kind as BusinessRecordType];
            const total = counts[kind as BusinessRecordType] || 0;
            return (
              <ListRow
                actions={
                  <Button
                    aria-label={`Baixar CSV de ${String(label)}`}
                    disabled={exporting !== null}
                    onClick={() => void csv(kind as BusinessRecordType)}
                    size="sm"
                    variant="outline"
                  >
                    <Download aria-hidden="true" />
                    {exporting === kind ? 'Preparando…' : 'Baixar'}
                  </Button>
                }
                details={`${total} ${total === 1 ? 'registro' : 'registros'}`}
                key={kind}
                leading={look && <IconChip icon={look.icon} tone={look.tone} />}
                title={String(label)}
              />
            );
          })}
        </ListGroup>
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
