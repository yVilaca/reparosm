'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import BrandLogo from '@/components/brand-logo';
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
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md" aria-busy="true">
          <CardContent className="grid gap-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-20 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-32 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </main>
    );
  if (loadError)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md" role="alert">
          <CardContent className="grid gap-3 text-center">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Link do orçamento
            </p>
            <h1 className="text-lg font-semibold">Não foi possível carregar</h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button
              onClick={() => {
                setLoading(true);
                setLoadError('');
                setAttempt((value) => value + 1);
              }}
              type="button"
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  if (!record)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="grid gap-2 text-center">
            <h1 className="text-lg font-semibold">Orçamento não encontrado</h1>
            <p className="text-sm text-muted-foreground">
              Verifique se o link recebido está completo.
            </p>
          </CardContent>
        </Card>
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
    <main className="flex min-h-dvh justify-center p-4 sm:p-6">
      <Card className="h-fit w-full max-w-lg">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <BrandLogo className="w-28 shrink-0 sm:w-32" sizes="128px" />
          <span className="min-w-0 break-all text-right text-sm text-muted-foreground">
            Orçamento {q.code || record.id}
          </span>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Orçamento para
            </p>
            <h1 className="text-xl font-semibold">{q.customer}</h1>
            <p className="text-sm text-muted-foreground">{q.device}</p>
          </div>
          {q.problem && (
            <div>
              <p className="text-xs text-muted-foreground">Problema relatado</p>
              <p className="text-sm">{q.problem}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Serviço proposto</p>
            <p className="text-sm">{q.service}</p>
          </div>
          {q.notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{q.notes}</p>
            </div>
          )}
          <div className="grid gap-1 rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Valor total</p>
            <strong className="text-2xl">{money(q.total)}</strong>
            {q.validUntil && (
              <span className="text-xs text-muted-foreground">
                Válido até {new Date(`${q.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {answered ? (
            <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              Resposta registrada: <strong>{done || q.status}</strong>
              {(done || q.status) === 'Aprovado' && (
                <p className="mt-1">
                  Sua ordem de serviço foi criada e a assistência já pode iniciar o atendimento.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {responseError && (
                <p className="text-sm text-destructive" role="alert">
                  {responseError}
                </p>
              )}
              <Button disabled={deciding} onClick={() => decide('Aprovado')} type="button">
                {deciding ? 'Registrando...' : 'Aprovar orçamento'}
              </Button>
              <Button
                disabled={deciding}
                onClick={() => decide('Recusado')}
                type="button"
                variant="outline"
              >
                Recusar orçamento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
