'use client';

import { useEffect, useState } from 'react';
import TrackingView from '@/components/tracking-view';
import { Button } from '@/components/ui/button';
import type { PublicTracking } from '@/lib/order-tracking';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; tracking: PublicTracking }
  | { kind: 'invalid' }
  | { kind: 'offline' };

/**
 * O token fica depois do "#": o servidor não o recebe ao abrir a página. Ele
 * vai no corpo do POST, e o endereço continua com ele para o cliente poder
 * voltar depois pelo mesmo link.
 */
export default function TrackingPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('t') || '';
    let active = true;
    fetch('/api/public/tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) return setState({ kind: 'invalid' });
        if (!response.ok) return setState({ kind: 'offline' });
        const { tracking } = (await response.json()) as { tracking: PublicTracking };
        setState({ kind: 'ready', tracking });
      })
      .catch(() => active && setState({ kind: 'offline' }));
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.kind === 'ready') return <TrackingView tracking={state.tracking} />;
  if (state.kind === 'loading')
    return (
      <main aria-busy="true" className="mx-auto grid w-full max-w-lg gap-4 px-4 py-6 sm:py-10">
        <div className="flex items-center gap-3">
          <div className="size-11 animate-pulse rounded-xl bg-foreground/10" />
          <div className="h-4 w-40 animate-pulse rounded bg-foreground/10" />
        </div>
        <div className="h-52 animate-pulse rounded-2xl bg-foreground/10" />
        <div className="h-16 animate-pulse rounded-2xl bg-foreground/10" />
        <p className="sr-only">Carregando o acompanhamento…</p>
      </main>
    );
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-content-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {state.kind === 'invalid' ? 'Este link não está mais disponível' : 'Sem conexão'}
      </h1>
      <p className="text-muted-foreground">
        {state.kind === 'invalid'
          ? 'O link pode ter expirado ou sido trocado por um novo. Peça um link atualizado para a assistência.'
          : 'Não foi possível carregar o acompanhamento agora. Confira a internet e tente de novo.'}
      </p>
      {state.kind === 'offline' && (
        <Button
          className="mx-auto mt-2"
          onClick={() => {
            setState({ kind: 'loading' });
            setAttempt((value) => value + 1);
          }}
          type="button"
        >
          Tentar de novo
        </Button>
      )}
    </main>
  );
}
