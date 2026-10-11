'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2Off, MessageCircle } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import { relativeTime, trackingMessage, type TrackingSummary } from '@/lib/order-tracking';

type TrackedOrder = { id: string; code: string; customer: string; device: string; phone?: string };

/** O que aconteceu com os links da OS, numa frase. */
export function trackingStatus(summary: TrackingSummary | null, now = new Date()) {
  if (!summary) return 'Carregando…';
  if (summary.lastViewedAt)
    return `Cliente abriu ${relativeTime(summary.lastViewedAt, now)} (${summary.views} ${
      summary.views === 1 ? 'visita' : 'visitas'
    }).${summary.active ? '' : ' Links desativados.'}`;
  if (!summary.lastSentAt) return 'Nenhum link enviado ainda.';
  if (!summary.active) return 'Links desativados.';
  return `Enviado ${relativeTime(summary.lastSentAt, now)}, ainda não aberto.`;
}

const endpoint = (orderId: string) => `/api/orders/${encodeURIComponent(orderId)}/tracking`;

/** Na ficha da OS: manda o link de acompanhamento e mostra se o cliente abriu. */
export default function OrderTrackingPanel({
  order,
  initialSummary = null,
}: {
  order: TrackedOrder;
  /** Para testes; na ficha, o resumo é buscado ao abrir. */
  initialSummary?: TrackingSummary | null;
}) {
  const { notify, confirm } = useFeedback();
  const [summary, setSummary] = useState<TrackingSummary | null>(initialSummary);
  const [busy, setBusy] = useState<'' | 'send' | 'copy' | 'revoke'>('');
  const [lastUrl, setLastUrl] = useState('');

  useEffect(() => {
    let active = true;
    fetch(endpoint(order.id), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { summary?: TrackingSummary } | null) => {
        if (active && result?.summary) setSummary(result.summary);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [order.id]);

  const issue = async () => {
    const response = await fetch(endpoint(order.id), { method: 'POST' });
    const result = (await response.json()) as {
      url?: string;
      summary?: TrackingSummary;
      error?: string;
    };
    if (!response.ok || !result.url)
      throw new Error(result.error || 'Não foi possível gerar o link.');
    if (result.summary) setSummary(result.summary);
    setLastUrl(result.url);
    return result.url;
  };

  const send = async () => {
    const phone = order.phone || '';
    if (!hasValidWhatsapp(phone)) {
      notify('Cadastre um WhatsApp válido nesta ordem.', 'error');
      return;
    }
    // Abre a janela já no clique (senão o navegador bloqueia) e preenche quando o link chega.
    const popup = window.open('about:blank', '_blank');
    setBusy('send');
    try {
      const message = trackingMessage(order, await issue());
      if (popup) {
        popup.opener = null;
        popup.location.href = whatsappUrl(phone, message);
      } else window.location.href = whatsappUrl(phone, message);
      void fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            customer: order.customer,
            phone,
            kind: 'Link de acompanhamento',
            message,
            status: 'Aberto no WhatsApp',
            sentAt: new Date().toISOString(),
          },
        }),
      });
    } catch (error) {
      popup?.close();
      notify(error instanceof Error ? error.message : 'Não foi possível gerar o link.', 'error');
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    setBusy('copy');
    try {
      const url = await issue();
      try {
        await navigator.clipboard.writeText(url);
        notify('Link copiado. Cole na conversa com o cliente.', 'success');
      } catch {
        notify('Link gerado. Copie o endereço abaixo.', 'success');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível gerar o link.', 'error');
    } finally {
      setBusy('');
    }
  };

  const revoke = async () => {
    if (
      !(await confirm(
        'Desativar os links desta OS? Quem tiver um link enviado deixa de ver o acompanhamento.',
      ))
    )
      return;
    setBusy('revoke');
    try {
      const response = await fetch(endpoint(order.id), { method: 'DELETE' });
      const result = (await response.json()) as { summary?: TrackingSummary; error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível desativar os links.');
      if (result.summary) setSummary(result.summary);
      setLastUrl('');
      notify('Links desativados.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível desativar os links.',
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-labelledby="tracking-panel-title" className="grid gap-3 border-t pt-4">
      <div>
        <h3 id="tracking-panel-title" className="font-semibold">
          Acompanhamento do cliente
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Um link só de leitura para o cliente ver a situação, o valor e falar com a loja.
        </p>
      </div>
      <p aria-live="polite" className="text-sm">
        {trackingStatus(summary)}
      </p>
      <div className="grid gap-2">
        <Button
          disabled={Boolean(busy)}
          onClick={() => void send()}
          type="button"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" />
          {busy === 'send' ? 'Gerando link…' : 'Enviar no WhatsApp'}
        </Button>
        <Button
          disabled={Boolean(busy)}
          onClick={() => void copy()}
          type="button"
          variant="outline"
        >
          <Copy aria-hidden="true" />
          {busy === 'copy' ? 'Gerando link…' : 'Copiar link'}
        </Button>
      </div>
      {lastUrl && (
        <Input
          aria-label="Link de acompanhamento gerado"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={lastUrl}
        />
      )}
      {Boolean(summary?.active) && (
        <Button
          className="justify-self-start px-0 text-muted-foreground"
          disabled={Boolean(busy)}
          onClick={() => void revoke()}
          size="sm"
          type="button"
          variant="link"
        >
          <Link2Off aria-hidden="true" />
          Desativar links
        </Button>
      )}
    </section>
  );
}
