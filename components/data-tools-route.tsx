'use client';

import { useState } from 'react';
import Link from 'next/link';
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

const parseCsv = (line: string) =>
  line
    .split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.replace(/^"|"$/g, '').replaceAll('""', '"'));

export default function DataToolsRoute({ records }: { records: StoredRecord[] }) {
  const [type, setType] = useState<BusinessRecordType>('client');
  const save = async (recordType: BusinessRecordType, data: DataObject) => {
    // ponytail: reuse the validated state endpoint until resource routes migrate one module at a time.
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: recordType, data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar o registro.');
  };
  const csv = (kind: BusinessRecordType) => {
    const rows = records
      .filter((record) => record.type === kind)
      .map((record) => ({ id: record.id, ...record.data }) as DataObject & { id: string });
    if (!rows.length)
      return alert(`Não há ${(labels[kind] || 'registros').toLowerCase()} para exportar.`);
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
        alert(`${Math.max(0, lines.length - 1)} registros importados.`);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Não foi possível importar o CSV.');
      }
    };
    reader.onerror = () => alert('Não foi possível ler o arquivo CSV.');
    reader.readAsText(file, 'utf-8');
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Dados &amp; exportação</h1>
          <small>Exporte, importe e preserve os dados da assistência.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <article className="data-hero">
        <div>
          <span>⇩</span>
          <div>
            <h2>Central de dados</h2>
            <p>Exporte cópias, importe planilhas CSV e gere o relatório completo da loja.</p>
          </div>
        </div>
        <button type="button" onClick={() => window.open('/relatorio', '_blank')}>
          Gerar relatório PDF ↗
        </button>
      </article>
      <div className="export-grid">
        {Object.entries(labels).map(([kind, label]) => (
          <article className="panel" key={kind}>
            <span>ARQUIVO CSV</span>
            <h3>{String(label)}</h3>
            <p>{records.filter((record) => record.type === kind).length} registros disponíveis</p>
            <button type="button" onClick={() => csv(kind as BusinessRecordType)}>
              Baixar CSV
            </button>
          </article>
        ))}
      </div>
      <article className="panel import-card">
        <div>
          <h3>Importar arquivo CSV</h3>
          <p>
            Use ponto e vírgula como separador. A primeira linha deve conter os nomes dos campos.
          </p>
        </div>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as BusinessRecordType)}
        >
          {Object.entries(labels).map(([kind, label]) => (
            <option value={kind} key={kind}>
              {String(label)}
            </option>
          ))}
        </select>
        <label>
          Selecionar CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])}
          />
        </label>
      </article>
    </>
  );
}
