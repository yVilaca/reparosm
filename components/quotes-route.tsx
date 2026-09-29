'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import QuoteModal, { type QuoteRow, type SaveQuote } from '@/components/quote-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Quote } from '@/lib/types';

function quoteStatusVariant(status: string | undefined): 'success' | 'destructive' | 'secondary' {
  if (status === 'Aprovado') return 'success';
  if (status === 'Recusado') return 'destructive';
  return 'secondary';
}

export default function QuotesRoute({ initialQuotes }: { initialQuotes: QuoteRow[] }) {
  const { notify, confirm } = useFeedback();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<QuoteRow | null>(null);
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
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.',
        'error',
      );
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (quote: QuoteRow) => {
    setEditing(quote);
    setModal('edit');
  };
  const remove = async (quote: QuoteRow) => {
    if (!(await confirm(`Excluir definitivamente o orçamento ${quote.code || quote.id}?`))) return;
    try {
      const response = await fetch(`/api/quotes?id=${encodeURIComponent(quote.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o orçamento.');
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
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
  const actions = (quote: QuoteRow) => (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => window.open(link(quote), '_blank', 'noopener,noreferrer')}
        size="sm"
        variant="outline"
      >
        Abrir
      </Button>
      <Button onClick={() => edit(quote)} size="sm" variant="outline">
        Editar
      </Button>
      <Button onClick={() => copy(quote)} size="sm" variant="outline">
        Copiar link
      </Button>
      <Button onClick={() => send(quote)} size="sm" variant="outline">
        WhatsApp
      </Button>
      <Button onClick={() => remove(quote)} size="sm" variant="destructive">
        Excluir
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Crie propostas e acompanhe a decisão do cliente."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Novo orçamento
            </Button>
          </div>
        }
      />
      {quotes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{quotes.length} orçamentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {quotes.map((quote) => (
                <article className="grid gap-3 rounded-lg border p-4" key={quote.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong>{quote.code || 'Orçamento sem código'}</strong>
                    <Badge variant={quoteStatusVariant(quote.status)}>
                      {quote.status || 'Aguardando'}
                    </Badge>
                  </div>
                  <div className="grid gap-1">
                    <h3 className="font-medium">{quote.customer}</h3>
                    <p className="text-sm text-muted-foreground">WhatsApp: {quote.phone || '—'}</p>
                    <p className="text-sm text-muted-foreground">Aparelho: {quote.device || '—'}</p>
                    <p className="text-sm">
                      {quote.problem || quote.service || 'Sem descrição do serviço'}
                    </p>
                  </div>
                  <div className="flex justify-between gap-3 border-t pt-3">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <strong>{formatMoney(quote.total)}</strong>
                  </div>
                  {actions(quote)}
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Aparelho</TableHead>
                    <TableHead>Problema</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.code || '—'}</TableCell>
                      <TableCell>{quote.customer}</TableCell>
                      <TableCell>{quote.phone || '—'}</TableCell>
                      <TableCell>{quote.device || '—'}</TableCell>
                      <TableCell className="max-w-[190px] whitespace-normal break-words">
                        {quote.problem || quote.service || '—'}
                      </TableCell>
                      <TableCell>{formatMoney(quote.total)}</TableCell>
                      <TableCell>
                        <Badge variant={quoteStatusVariant(quote.status)}>
                          {quote.status || 'Aguardando'}
                        </Badge>
                      </TableCell>
                      <TableCell>{actions(quote)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Nenhum orçamento"
          description="Crie um orçamento detalhado e compartilhe o link com o cliente."
          action={<Button onClick={create}>Criar orçamento</Button>}
        />
      )}
      {modal === 'create' && <QuoteModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <QuoteModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}
