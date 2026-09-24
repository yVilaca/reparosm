'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import { formatMoney as money } from '@/lib/format';
import type { Quote, QuoteStatus } from '@/lib/types';

type PublicQuote = {
  code?: string;
  customer: string;
  device: string;
  problem?: string;
  service: string;
  notes?: string;
  total?: number;
  validUntil?: string;
  status?: Quote['status'];
  orderId?: string;
};
type PublicQuoteRecord = { id: string; data: PublicQuote };
export default function PublicQuote() {
  const { confirm } = useFeedback();
  const { id } = useParams<{ id: string }>(),
    [record, setRecord] = useState<PublicQuoteRecord | null>(null),
    [done, setDone] = useState<QuoteStatus | ''>(''),
    [loading, setLoading] = useState(true),
    [deciding, setDeciding] = useState(false),
    [loadError, setLoadError] = useState(''),
    [responseError, setResponseError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [loadedId, setLoadedId] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`/api/public/quote?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          record?: PublicQuoteRecord | null;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o orçamento.');
        if (active) {
          setRecord(result.record || null);
          setLoadedId(id);
          setLoadError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadedId(id);
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar o orçamento.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, id]);
  if (loading || loadedId !== id)
    return (
      <main className="public-page">
        <article className="public-card public-loading" aria-busy="true">
          <span className="quote-skeleton quote-skeleton-short" />
          <span className="quote-skeleton quote-skeleton-title" />
          <span className="quote-skeleton" />
          <span className="quote-skeleton quote-skeleton-total" />
        </article>
      </main>
    );
  if (loadError)
    return (
      <main className="public-page">
        <article className="public-card public-error" role="alert">
          <span className="public-eyebrow">Link do orçamento</span>
          <h1>Não foi possível carregar</h1>
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError('');
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </article>
      </main>
    );
  if (!record)
    return (
      <main className="public-page">
        <div className="public-card">
          <h1>Orçamento não encontrado</h1>
          <p>Verifique se o link recebido está completo.</p>
        </div>
      </main>
    );
  const q = record.data;
  const decide = async (status: 'Aprovado' | 'Recusado') => {
    if (deciding) return;
    if (status === 'Recusado') {
      const accepted = await confirm(
        'Recusar este orçamento? Essa resposta será enviada à assistência.',
      );
      if (!accepted) return;
    }
    setDeciding(true);
    setResponseError('');
    try {
      const response = await fetch('/api/public/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, status }),
      });
      const result = (await response.json()) as { error?: string; orderId?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar a resposta.');
      setDone(status);
      setRecord({ ...record, data: { ...q, status, orderId: result.orderId } });
    } catch (error: unknown) {
      setResponseError(
        error instanceof Error ? error.message : 'Não foi possível registrar a resposta.',
      );
    } finally {
      setDeciding(false);
    }
  };
  const answered = done || q.status === 'Aprovado' || q.status === 'Recusado';
  return (
    <main className="public-page">
      <article className="public-card quote-public">
        <header>
          <b>ReparoSM</b>
          <span>Orçamento {q.code || record.id}</span>
        </header>
        <div className="quote-status">
          <span>Orçamento para</span>
          <h1>{q.customer}</h1>
          <p>{q.device}</p>
        </div>
        {q.problem && (
          <section>
            <small>Problema relatado</small>
            <p>{q.problem}</p>
          </section>
        )}
        <section>
          <small>Serviço proposto</small>
          <p>{q.service}</p>
        </section>
        {q.notes && (
          <section className="quote-notes">
            <small>Observações</small>
            <p>{q.notes}</p>
          </section>
        )}
        <div className="public-total">
          <small>Valor total</small>
          <strong>{money(q.total)}</strong>
          {q.validUntil && (
            <span>
              Válido até {new Date(`${q.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        {answered ? (
          <div className="public-success">
            Resposta registrada: <b>{done || q.status}</b>
            {(done || q.status) === 'Aprovado' && (
              <span>
                Sua ordem de serviço foi criada e a assistência já pode iniciar o atendimento.
              </span>
            )}
          </div>
        ) : (
          <div className="quote-decision-actions">
            {responseError && (
              <p className="public-inline-error" role="alert">
                {responseError}
              </p>
            )}
            <button type="button" disabled={deciding} onClick={() => decide('Aprovado')}>
              {deciding ? 'Registrando...' : 'Aprovar orçamento'}
            </button>
            <button
              type="button"
              disabled={deciding}
              className="outline"
              onClick={() => decide('Recusado')}
            >
              Recusar orçamento
            </button>
          </div>
        )}
      </article>
    </main>
  );
}
