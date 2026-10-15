'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  checkGroups,
  checks,
  checklistSummary,
  damageLabel,
  type CheckState,
  type Checklist,
} from '@/lib/order-checklist';
import type { Order, Shop } from '@/lib/types';

type PrintableOrder = Pick<Order, 'code' | 'customer' | 'phone' | 'device' | 'imei' | 'technician'>;

const stateLabel: Record<CheckState, string> = {
  ok: 'Funcionando',
  fail: 'Defeito',
  skip: 'Não testado',
};

const stateClass: Record<CheckState | 'none', string> = {
  ok: 'checklist-print-state checklist-print-state-ok',
  fail: 'checklist-print-state checklist-print-state-fail',
  skip: 'checklist-print-state checklist-print-state-skip',
  none: 'checklist-print-state checklist-print-state-none',
};

const sourceLabel = (source?: 'shop' | 'device') =>
  source === 'device' ? 'Teste pelo aparelho' : source === 'shop' ? 'Conferido na loja' : '—';

const dateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(value))
    : 'Não informado';

const sideLabel = (side: 'front' | 'back') => (side === 'front' ? 'Frente' : 'Traseira');

export default function ChecklistPrintDocument({
  order,
  shop,
  checklist,
  copies,
}: {
  order: PrintableOrder;
  shop?: Shop;
  checklist: Checklist;
  copies: number;
}) {
  const summary = checklistSummary(checklist);

  return (
    <div className="checklist-print-document">
      <div className="checklist-print-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Checklist de entrada · {copies} {copies === 1 ? 'via' : 'vias'}
        </p>
        <Button onClick={() => window.print()} type="button">
          <Printer aria-hidden="true" />
          Imprimir / salvar PDF
        </Button>
      </div>

      {Array.from({ length: copies }, (_, copyIndex) => (
        <article className="checklist-print-sheet" key={copyIndex}>
          {shop?.customerPrintMessage && copyIndex === 1 && (
            <p className="checklist-print-message">{shop.customerPrintMessage}</p>
          )}

          <header className="checklist-print-header">
            <div className="checklist-print-brand">
              {shop?.logo && (
                // eslint-disable-next-line @next/next/no-img-element -- documento para impressão
                <img
                  alt={`Logo de ${shop.name || 'assistência técnica'}`}
                  className="checklist-print-logo"
                  src={shop.logo}
                />
              )}
              <div>
                <h1>{shop?.name || shop?.legalName || 'Assistência técnica'}</h1>
                {shop?.legalName && <p>{shop.legalName}</p>}
                {shop?.document && <p>Documento: {shop.document}</p>}
                {shop?.address && <p>{shop.address}</p>}
                <p>{[shop?.phone, shop?.email].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="checklist-print-number">
              <strong>Checklist de entrada</strong>
              <b>{order.code}</b>
              <span>
                {copies > 1
                  ? copyIndex === 0
                    ? 'Via da assistência'
                    : 'Via do cliente'
                  : 'Via única'}
              </span>
            </div>
          </header>

          <section className="checklist-print-section">
            <h2>Cliente e aparelho</h2>
            <dl className="checklist-print-fields">
              <Field label="Cliente" value={order.customer} />
              <Field label="Telefone" value={order.phone} />
              <Field label="Aparelho" value={order.device} />
              <Field label="IMEI / número de série" value={order.imei} />
            </dl>
          </section>

          <section className="checklist-print-summary checklist-print-section">
            <div>
              <h2>Resumo da conferência</h2>
              <p>{summary.text}</p>
            </div>
            <dl className="checklist-print-summary-values">
              <Field
                label="O aparelho liga?"
                value={
                  checklist.powersOn === false
                    ? 'Não'
                    : checklist.powersOn === true
                      ? 'Sim'
                      : 'Não informado'
                }
              />
              <Field label="Conferidos" value={`${summary.answered} de ${summary.total}`} />
              <Field label="Defeitos" value={summary.fail} />
              <Field label="Avarias" value={summary.marks} />
            </dl>
          </section>

          <section className="checklist-print-section">
            <h2>Itens verificados</h2>
            <table className="checklist-print-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Resultado</th>
                  <th>Origem</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {checkGroups.map((group) => (
                  <tr className="checklist-print-group" key={group}>
                    <th colSpan={4}>{group}</th>
                  </tr>
                ))}
                {checkGroups.flatMap((group) =>
                  checks
                    .filter((check) => check.group === group)
                    .map((check) => {
                      const item = checklist.items[check.key];
                      const state = checklist.powersOn === false ? undefined : item?.state;
                      return (
                        <tr key={check.key}>
                          <td>{check.label}</td>
                          <td>
                            <span className={stateClass[state ?? 'none']}>
                              {state ? stateLabel[state] : 'Não respondido'}
                            </span>
                          </td>
                          <td>{sourceLabel(item?.by)}</td>
                          <td>{item?.note || '—'}</td>
                        </tr>
                      );
                    }),
                )}
              </tbody>
            </table>
          </section>

          <section className="checklist-print-section checklist-print-two-columns">
            <div>
              <h2>Avarias identificadas</h2>
              {checklist.marks.length ? (
                <ul className="checklist-print-list">
                  {checklist.marks.map((mark) => (
                    <li key={mark.id}>
                      <strong>{damageLabel(mark.kind)}</strong> · {sideLabel(mark.side)}
                      {mark.note ? ` · ${mark.note}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma avaria registrada.</p>
              )}
            </div>
            <div>
              <h2>Dados do teste pelo aparelho</h2>
              {checklist.device ? (
                <dl className="checklist-print-list">
                  {checklist.device.platform && (
                    <Field label="Plataforma" value={checklist.device.platform} />
                  )}
                  {checklist.device.screen && (
                    <Field label="Tela detectada" value={checklist.device.screen} />
                  )}
                  {checklist.device.battery !== undefined && (
                    <Field label="Bateria no teste" value={`${checklist.device.battery}%`} />
                  )}
                </dl>
              ) : (
                <p>Nenhum teste remoto registrado.</p>
              )}
            </div>
          </section>

          <section className="checklist-print-section">
            <h2>Observações</h2>
            <p className="checklist-print-notes">
              {checklist.notes || 'Nenhuma observação registrada.'}
            </p>
          </section>

          {shop?.terms && (
            <section className="checklist-print-section">
              <h2>Termos da assistência</h2>
              <p className="checklist-print-notes">{shop.terms}</p>
            </section>
          )}

          <footer className="checklist-print-footer">
            <p>Conferência concluída em {dateTime(checklist.completedAt)}.</p>
            <div className="checklist-print-signatures">
              <div>
                <span>Assinatura do cliente</span>
                <strong>{order.customer || 'Cliente'}</strong>
              </div>
              <div>
                <span>Assinatura da assistência</span>
                <strong>{order.technician || shop?.technician || 'Responsável técnico'}</strong>
              </div>
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === undefined || value === '' ? '—' : value}</dd>
    </div>
  );
}
