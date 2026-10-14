'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { ClipboardCheck } from 'lucide-react';
import { stateBg } from '@/components/device-diagram';
import { Button } from '@/components/ui/button';
import { checklistSummary, checks, type Checklist } from '@/lib/order-checklist';

/** Na ficha da OS: o resultado do checklist de entrada e o caminho para a bancada. */
export default function OrderChecklistPanel({
  orderId,
  initial = null,
}: {
  orderId: string;
  /** Para testes; na ficha, o checklist é buscado ao abrir. */
  initial?: Checklist | null;
}) {
  const [checklist, setChecklist] = useState<Checklist | null>(initial);
  const [loaded, setLoaded] = useState(Boolean(initial));

  useEffect(() => {
    let active = true;
    fetch(`/api/orders/${encodeURIComponent(orderId)}/checklist`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { checklist?: Checklist } | null) => {
        if (!active) return;
        if (result?.checklist) setChecklist(result.checklist);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [orderId]);

  const summary = checklistSummary(checklist);
  const off = checklist?.powersOn === false;
  return (
    <section aria-labelledby="checklist-panel-title" className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="checklist-panel-title" className="font-semibold">
            Checklist de entrada
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {!loaded
              ? 'Carregando…'
              : summary.status === 'empty'
                ? 'Teste o aparelho antes de mexer nele: o que funciona, o que já tem defeito e as avarias.'
                : summary.text}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/ordens/${encodeURIComponent(orderId)}/checklist`}>
            <ClipboardCheck aria-hidden="true" />
            {summary.status === 'empty' ? 'Fazer checklist' : 'Abrir checklist'}
          </Link>
        </Button>
      </div>
      {checklist && summary.status !== 'empty' && !off && (
        <div aria-hidden="true" className="flex gap-[3px]">
          {checks.map((check) => (
            <span
              key={check.key}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                stateBg[checklist.items[check.key]?.state ?? 'none'],
              )}
              title={check.label}
            />
          ))}
        </div>
      )}
    </section>
  );
}
