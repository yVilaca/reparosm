'use client';

import { useEffect, useState } from 'react';
import DeviceSelfTest from '@/components/device-self-test';
import { Button } from '@/components/ui/button';
import type { PublicDeviceTest } from '@/lib/order-checklist';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; token: string; test: PublicDeviceTest }
  | { kind: 'invalid' }
  | { kind: 'offline' };

/**
 * Aberta no próprio aparelho pelo QR code da bancada. O token fica depois do
 * "#": o servidor não o recebe ao abrir a página; ele segue no corpo do POST.
 */
export default function DeviceTestPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('t') || '';
    let active = true;
    fetch('/api/public/device-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) return setState({ kind: 'invalid' });
        if (!response.ok) return setState({ kind: 'offline' });
        const { test } = (await response.json()) as { test: PublicDeviceTest };
        setState({ kind: 'ready', token, test });
      })
      .catch(() => active && setState({ kind: 'offline' }));
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.kind === 'ready') return <DeviceSelfTest test={state.test} token={state.token} />;
  if (state.kind === 'loading')
    return (
      <main aria-busy="true" className="grid min-h-dvh place-content-center gap-3 px-6 text-center">
        <div className="mx-auto size-12 animate-pulse rounded-2xl bg-foreground/10" />
        <p className="text-muted-foreground">Preparando o teste…</p>
      </main>
    );
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-content-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {state.kind === 'invalid' ? 'Este teste não está mais disponível' : 'Sem conexão'}
      </h1>
      <p className="text-muted-foreground">
        {state.kind === 'invalid'
          ? 'O código pode ter expirado ou sido trocado por um novo. Peça para a assistência mostrar o QR code de novo.'
          : 'Não foi possível abrir o teste agora. Confira a internet e tente de novo.'}
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
