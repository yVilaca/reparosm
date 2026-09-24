'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import QuoteModal, { type QuoteRow, type SaveQuote } from '@/components/quote-modal';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Quote } from '@/lib/types';

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

  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Orçamentos</h1>
          <small>Crie propostas e acompanhe a decisão do cliente.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
          <button className="primary" type="button" onClick={create}>
            + Novo orçamento
          </button>
        </div>
      </header>
      {quotes.length ? (
        <article className="panel page-panel quote-management">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Celular</th>
                  <th>Problema</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <b>{quote.code || '—'}</b>
                    </td>
                    <td>{quote.customer}</td>
                    <td>{quote.device}</td>
                    <td>{quote.problem || quote.service || '—'}</td>
                    <td>{formatMoney(quote.total)}</td>
                    <td>
                      <span
                        className={`tag ${quote.status === 'Aprovado' ? 'ready' : quote.status === 'Recusado' ? 'red' : 'progress'}`}
                      >
                        {quote.status || 'Aguardando'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => window.open(link(quote), '_blank', 'noopener,noreferrer')}
                        >
                          Abrir
                        </button>
                        <button type="button" onClick={() => edit(quote)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => copy(quote)}>
                          Copiar link
                        </button>
                        <button
                          className="whatsapp-btn small"
                          type="button"
                          onClick={() => send(quote)}
                        >
                          WhatsApp
                        </button>
                        <button type="button" onClick={() => remove(quote)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>Nenhum orçamento</h2>
          <p>Crie um orçamento detalhado e compartilhe o link com o cliente.</p>
          <button className="primary" type="button" onClick={create}>
            Criar orçamento
          </button>
        </article>
      )}
      {modal === 'create' && <QuoteModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <QuoteModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}
