'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import OrderPaymentDialog from '@/components/order-payment-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import type { ReceivableOrder, ReceivableGroup } from '@/lib/repos/cash';

export default function ReceivablesRoute({
  ready,
  inProgress,
}: {
  ready: ReceivableGroup & { list: ReceivableOrder[] };
  inProgress: ReceivableGroup;
}) {
  const router = useRouter();
  const [charging, setCharging] = useState<ReceivableOrder | null>(null);
  return (
    <>
      <PageHeader
        title="Contas a receber"
        description="Ordens concluídas que ainda aguardam o recebimento do cliente."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/contas-pagar">Contas a pagar</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/pagamentos">Caixa</Link>
            </Button>
          </div>
        }
      />
      <section aria-label="Resumo de contas a receber" className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent className="grid gap-1">
            <p className="text-sm text-muted-foreground">A receber</p>
            <strong className="text-xl tabular-nums">{formatMoney(ready.amount)}</strong>
            <p className="text-xs text-muted-foreground">{ready.orders} OS concluídas</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="grid gap-1">
            <p className="text-sm text-muted-foreground">Aguardando conclusão</p>
            <strong className="text-xl tabular-nums">{formatMoney(inProgress.amount)}</strong>
            <p className="text-xs text-muted-foreground">{inProgress.orders} OS fora da cobrança</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="grid gap-1">
            <p className="text-sm text-muted-foreground">Regra</p>
            <strong className="text-xl">Status concluído</strong>
            <p className="text-xs text-muted-foreground">Entra aqui ao concluir a OS</p>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Ordens pendentes de recebimento</CardTitle>
          <CardDescription>Registre o pagamento para lançar a entrada no caixa.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready.list.length ? (
            <div className="grid gap-3">
              {ready.list.map((order) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  key={order.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      href={`/ordens?busca=${encodeURIComponent(order.code)}`}
                    >
                      {order.code} · {order.customer}
                    </Link>
                    <p className="text-sm text-muted-foreground">Total da OS</p>
                  </div>
                  <strong className="tabular-nums">{formatMoney(order.total)}</strong>
                  <Button onClick={() => setCharging(order)} size="sm">
                    Registrar recebimento
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nada pendente"
              description="As ordens concluídas já estão recebidas ou não têm valor a cobrar."
            />
          )}
        </CardContent>
      </Card>
      {charging && (
        <OrderPaymentDialog
          close={() => setCharging(null)}
          order={charging}
          saved={() => {
            setCharging(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
