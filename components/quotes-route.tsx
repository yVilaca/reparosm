'use client';

import { newestFirst } from '@/lib/sorting';

import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import QuoteModal, { type QuoteRow, type SaveQuote } from '@/components/quote-modal';
import QuoteRecordDialog from '@/components/quote-record';
import { CheckCircle2, Clock, FileText, MessageCircle, Plus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import EmptyState from '@/components/ui/empty-state';
import IconChip from '@/components/ui/icon-chip';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import RowMenu from '@/components/ui/row-menu';
import StatCard, { StatGroup } from '@/components/ui/stat-card';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import { quoteStatusTone } from '@/lib/status-tones';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { Quote, QuoteStatus } from '@/lib/types';

const groups: { status: QuoteStatus; title: string }[] = [
  { status: 'Aguardando', title: 'Esperando resposta' },
  { status: 'Aprovado', title: 'Aprovados' },
  { status: 'Recusado', title: 'Recusados' },
];
const statusIcon = { Aguardando: Clock, Aprovado: CheckCircle2, Recusado: XCircle };

/** Dias desde a criação, em dias de São Paulo. */
const daysSince = (iso: string | undefined, today: string) => {
  if (!iso) return null;
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000));
};
const waiting = (days: number | null) =>
  days === null
    ? 'Esperando resposta'
    : days === 0
      ? 'Enviado hoje'
      : `Esperando há ${days} ${days === 1 ? 'dia' : 'dias'}`;
const sum = (rows: QuoteRow[]) =>
  rows.reduce((total, quote) => total + Math.round(Number(quote.total || 0) * 100), 0) / 100;

export default function QuotesRoute({ initialQuotes }: { initialQuotes: QuoteRow[] }) {
  const { notify, confirm } = useFeedback();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [creating, setCreating] = useState(false);
  // Ficha aberta e se ela começa no formulário (veio de um "Editar").
  const [viewing, setViewing] = useState<{ id: string; editing: boolean } | null>(null);
  const viewed = viewing && quotes.find((quote) => quote.id === viewing.id);
  const save: SaveQuote = async (data: Quote, id?: string) => {
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Quote };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o orçamento.');
      const saved = { id: result.record.id, ...result.record.data };
      setQuotes((current) =>
        id ? current.map((quote) => (quote.id === id ? saved : quote)) : [saved, ...current],
      );
      notify(id ? 'Orçamento atualizado.' : 'Orçamento criado.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.',
        'error',
      );
      throw error;
    }
  };
  const create = () => setCreating(true);
  const view = (quote: QuoteRow) => setViewing({ id: quote.id, editing: false });
  const edit = (quote: QuoteRow) => setViewing({ id: quote.id, editing: true });
  const remove = async (quote: QuoteRow) => {
    if (!(await confirm(`Excluir definitivamente o orçamento ${quote.code || quote.id}?`))) return;
    try {
      const response = await fetch(`/api/quotes?id=${encodeURIComponent(quote.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o orçamento.');
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
      notify('Orçamento excluído.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o orçamento.',
        'error',
      );
    }
  };
  const link = (quote: QuoteRow) => `${window.location.origin}/o/${encodeURIComponent(quote.id)}`;
  const copy = async (quote: QuoteRow) => {
    try {
      await navigator.clipboard.writeText(link(quote));
      notify('Link do orçamento copiado.', 'success');
    } catch {
      notify('Não foi possível copiar o link do orçamento.', 'error');
    }
  };
  const send = (quote: QuoteRow) => {
    const message = `Olá, ${quote.customer}! Seu orçamento ${quote.code} para ${quote.device} está pronto. Visualize, aprove ou recuse aqui: ${link(quote)}`;
    if (!hasValidWhatsapp(quote.phone)) {
      notify('Cadastre um WhatsApp válido no orçamento.', 'error');
      return;
    }
    window.open(whatsappUrl(quote.phone, message), '_blank', 'noopener,noreferrer');
  };
  const open = (quote: QuoteRow) => window.open(link(quote), '_blank', 'noopener,noreferrer');
  const today = todayInSaoPaulo();
  const byStatus = (status: QuoteStatus) =>
    quotes
      .filter((quote) => (quote.status || 'Aguardando') === status)
      .sort((a, b) => (status === 'Aguardando' ? newestFirst(b, a) : newestFirst(a, b)));
  const pending = byStatus('Aguardando');
  const approved = byStatus('Aprovado');
  const refused = byStatus('Recusado');

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Crie propostas e acompanhe a decisão do cliente."
        action={
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Novo orçamento
          </Button>
        }
      />
      {quotes.length ? (
        <>
          <StatGroup aria-label="Resumo dos orçamentos" className="mb-6 grid-cols-3">
            <StatCard
              detail={`${formatMoney(sum(pending))} em jogo`}
              icon={Clock}
              label="Esperando"
              tone="warning"
              value={pending.length}
            />
            <StatCard
              detail={formatMoney(sum(approved))}
              icon={CheckCircle2}
              label="Aprovados"
              tone="success"
              value={approved.length}
            />
            <StatCard
              detail={formatMoney(sum(refused))}
              icon={XCircle}
              label="Recusados"
              tone="danger"
              value={refused.length}
            />
          </StatGroup>
          <div className="grid gap-6">
            {groups.map(({ status, title }) => {
              const rows = byStatus(status);
              if (!rows.length) return null;
              const tone = quoteStatusTone(status);
              return (
                <ListGroup
                  aside={<span>{formatMoney(sum(rows))}</span>}
                  count={rows.length}
                  key={status}
                  title={title}
                >
                  {rows.map((quote) => {
                    const days = daysSince(quote.createdAt, today);
                    const late = status === 'Aguardando' && (days ?? 0) >= 2;
                    return (
                      <ListRow
                        actions={
                          <>
                            {status === 'Aguardando' ? (
                              <Button
                                className="w-28"
                                onClick={() => send(quote)}
                                size="sm"
                                variant={late ? 'default' : 'outline'}
                              >
                                <MessageCircle aria-hidden="true" />
                                {late ? 'Cobrar' : 'Enviar'}
                              </Button>
                            ) : (
                              <Button
                                className="w-28"
                                onClick={() => open(quote)}
                                size="sm"
                                variant="outline"
                              >
                                <FileText aria-hidden="true" />
                                Abrir
                              </Button>
                            )}
                            <RowMenu label={quote.code || quote.customer}>
                              {status === 'Aguardando' ? (
                                <DropdownMenuItem onSelect={() => open(quote)}>
                                  Abrir orçamento
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => send(quote)}>
                                  Enviar pelo WhatsApp
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => void copy(quote)}>
                                Copiar link
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => edit(quote)}>
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => void remove(quote)}
                                variant="destructive"
                              >
                                Excluir
                              </DropdownMenuItem>
                            </RowMenu>
                          </>
                        }
                        details={[quote.device, quote.problem || quote.service]
                          .filter(Boolean)
                          .join(' · ')}
                        key={quote.id}
                        leading={<IconChip icon={statusIcon[status]} tone={tone} />}
                        note={status === 'Aguardando' ? waiting(days) : status}
                        onOpen={() => view(quote)}
                        openLabel={`Ver orçamento ${quote.code || quote.customer}`}
                        noteTone={late ? 'warning' : status === 'Aguardando' ? undefined : tone}
                        tag={quote.code}
                        title={quote.customer}
                        value={formatMoney(quote.total)}
                      />
                    );
                  })}
                </ListGroup>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          title="Nenhum orçamento"
          description="Crie um orçamento detalhado e compartilhe o link com o cliente."
          action={<Button onClick={create}>Criar orçamento</Button>}
        />
      )}
      {creating && <QuoteModal close={() => setCreating(false)} save={save} />}
      {viewed && (
        <QuoteRecordDialog
          close={() => setViewing(null)}
          key={viewed.id}
          onCopyLink={() => void copy(viewed)}
          onOpenPage={() => open(viewed)}
          onSend={() => send(viewed)}
          quote={viewed}
          save={save}
          startEditing={viewing.editing}
        />
      )}
    </>
  );
}
