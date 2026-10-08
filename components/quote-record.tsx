'use client';

import { ExternalLink, Link2, MessageCircle } from 'lucide-react';
import { QuoteForm, type QuoteRow, type SaveQuote } from '@/components/quote-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RecordDialog, { RecordField, RecordSection } from '@/components/ui/record-dialog';
import { formatMoney } from '@/lib/format';
import { badgeFor, quoteStatusTone } from '@/lib/status-tones';

const brDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(parsed);
};

/** Ficha do orçamento: abre para ver; "Editar" troca para o formulário na mesma janela. */
export default function QuoteRecordDialog({
  quote,
  close,
  save,
  startEditing = false,
  onSend,
  onOpenPage,
  onCopyLink,
}: {
  quote: QuoteRow;
  close: () => void;
  save: SaveQuote;
  startEditing?: boolean;
  onSend: () => void;
  onOpenPage: () => void;
  onCopyLink: () => void;
}) {
  const status = quote.status || 'Aguardando';
  return (
    <RecordDialog
      actions={
        <>
          <Button onClick={onCopyLink} variant="outline">
            <Link2 aria-hidden="true" />
            Copiar link
          </Button>
          <Button onClick={onOpenPage} variant="outline">
            <ExternalLink aria-hidden="true" />
            Página do cliente
          </Button>
        </>
      }
      badge={<Badge variant={badgeFor(quoteStatusTone(status))}>{status}</Badge>}
      className="max-w-2xl"
      close={close}
      description={[quote.customer, quote.device].filter(Boolean).join(' · ')}
      primary={
        status === 'Aguardando' && (
          <Button onClick={onSend}>
            <MessageCircle aria-hidden="true" />
            Enviar pelo WhatsApp
          </Button>
        )
      }
      renderEdit={(controls) => (
        <QuoteForm
          item={quote}
          markDirty={controls.markDirty}
          onCancel={controls.cancel}
          onSaved={controls.saved}
          save={save}
        />
      )}
      startEditing={startEditing}
      title={`Orçamento ${quote.code || ''}`.trim()}
    >
      <div className="grid gap-6">
        <RecordSection title="Cliente e aparelho">
          <RecordField label="Cliente">{quote.customer || 'Não informado'}</RecordField>
          <RecordField label="WhatsApp">{quote.phone || 'Não informado'}</RecordField>
          <RecordField label="Celular">{quote.device || 'Não informado'}</RecordField>
          <RecordField label="Criado em">{brDate(quote.createdAt) || 'Não informado'}</RecordField>
        </RecordSection>
        <RecordSection columns={1} title="Proposta">
          <RecordField label="Problema relatado">{quote.problem || 'Não informado'}</RecordField>
          <RecordField label="Serviço proposto">{quote.service || 'Não informado'}</RecordField>
          <RecordField label="Observações para o cliente">
            {quote.notes || 'Nenhuma observação'}
          </RecordField>
        </RecordSection>
        <RecordSection
          className="rounded-lg border bg-muted/30 p-4"
          columns={3}
          title="Valores e prazo"
        >
          <RecordField label="Mão de obra">{formatMoney(quote.labor)}</RecordField>
          <RecordField label="Peças">{formatMoney(quote.parts)}</RecordField>
          <RecordField label="Total">
            <strong className="text-lg tabular-nums">{formatMoney(quote.total)}</strong>
          </RecordField>
          <RecordField label="Válido até">{brDate(quote.validUntil) || 'Sem prazo'}</RecordField>
          {quote.answeredAt && (
            <RecordField label="Resposta do cliente">
              {status} em {brDate(quote.answeredAt)}
            </RecordField>
          )}
        </RecordSection>
      </div>
    </RecordDialog>
  );
}
