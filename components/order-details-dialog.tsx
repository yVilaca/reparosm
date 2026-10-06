'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pencil, Printer } from 'lucide-react';
import OrderPhotos from '@/components/order-photos';
import type { OrderRow } from '@/components/order-modals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format';
import { badgeFor, orderStageTone } from '@/lib/status-tones';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

function date(value?: string) {
  if (!value) return 'Não informada';
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime())
    ? 'Não informada'
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(parsed);
}

export function OrderDetails({ order }: { order: OrderRow }) {
  const total = Number(order.total || 0);
  const received = Number(order.payment?.value || 0);
  const balance = order.status === 'Cancelado' ? 0 : Math.max(0, total - received);
  const pattern = order.pattern || [];
  const point = (number: number) =>
    `${24 + ((number - 1) % 3) * 56},${24 + Math.floor((number - 1) / 3) * 56}`;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="grid min-w-0 content-start gap-6">
        <section aria-label="Cliente e aparelho" className="grid gap-3">
          <h3 className="font-semibold">Cliente e aparelho</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Cliente">{order.customer || 'Não informado'}</Detail>
            <Detail label="WhatsApp">{order.phone || 'Não informado'}</Detail>
            <Detail label="Aparelho">{order.device || 'Não informado'}</Detail>
            <Detail label="IMEI / Número de série">{order.imei || 'Não informado'}</Detail>
            <Detail label="Entrada">{date(order.createdAt)}</Detail>
            <Detail label="Última atualização">{date(order.updatedAt)}</Detail>
          </dl>
        </section>
        <section aria-label="Desbloqueio do aparelho" className="rounded-lg border bg-muted/30 p-4">
          <h3 className="mb-3 font-semibold">Desbloqueio do aparelho</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            {order.password?.trim() && (
              <Detail label="Senha numérica">
                <span className="text-lg font-semibold">{order.password}</span>
              </Detail>
            )}
            <Detail label="Padrão de desbloqueio">
              {pattern.length ? (
                <>
                  <svg
                    viewBox="0 0 160 160"
                    className="my-1 w-36 text-primary"
                    role="img"
                    aria-label={`Padrão de desbloqueio: ${pattern.join(' → ')}`}
                  >
                    <polyline
                      points={pattern.map(point).join(' ')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((number) => {
                      const [cx, cy] = point(number).split(',');
                      return (
                        <g key={number}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r="14"
                            className={
                              pattern.includes(number)
                                ? 'fill-primary'
                                : 'fill-background stroke-border'
                            }
                          />
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={
                              pattern.includes(number)
                                ? 'fill-primary-foreground'
                                : 'fill-muted-foreground'
                            }
                            fontSize="12"
                          >
                            {number}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <span className="block">{pattern.join(' → ')}</span>
                </>
              ) : (
                'Não informado'
              )}
            </Detail>
          </dl>
        </section>
        <section aria-label="Atendimento" className="grid gap-3">
          <h3 className="font-semibold">Atendimento</h3>
          <dl className="grid gap-4">
            <Detail label="Problema relatado">{order.problem || 'Não informado'}</Detail>
            <Detail label="Serviço">{order.service || 'Não informado'}</Detail>
            <Detail label="Observações">{order.notes || 'Nenhuma observação'}</Detail>
          </dl>
        </section>
        <section aria-label="Produtos e peças" className="grid gap-3">
          <h3 className="font-semibold">Produtos e peças</h3>
          {order.items?.length ? (
            <ul className="divide-y rounded-lg border px-3">
              {order.items.map((item) => (
                <li
                  key={item.partId}
                  className="flex items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(item.quantity * item.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum produto vinculado.</p>
          )}
        </section>
        <OrderPhotos orderId={order.id} readOnly />
      </div>
      <aside className="grid content-start gap-6 rounded-lg border bg-muted/30 p-4">
        <section aria-label="Situação da ordem" className="grid gap-3">
          <h3 className="font-semibold">Situação da ordem</h3>
          <dl className="grid gap-4">
            <Detail label="Etapa">
              <Badge variant={badgeFor(orderStageTone(order.stage || 'Recebido'))}>
                {order.stage || 'Recebido'}
              </Badge>
            </Detail>
            <Detail label="Status">{order.status || 'Aberto'}</Detail>
            <Detail label="Prioridade">{order.priority || 'Normal'}</Detail>
            <Detail label="Técnico responsável">{order.technician || 'Não informado'}</Detail>
            <Detail label="Garantia">
              {order.warrantyDays ? `${order.warrantyDays} dias` : 'Não informada'}
            </Detail>
            <Detail label="Entrega">{date(order.deliveredAt)}</Detail>
            {order.quoteCode && <Detail label="Orçamento de origem">{order.quoteCode}</Detail>}
          </dl>
        </section>
        <section aria-label="Valores e recebimento" className="grid gap-3 border-t pt-4">
          <h3 className="font-semibold">Valores e recebimento</h3>
          <dl className="grid gap-3 tabular-nums">
            <Detail label="Mão de obra">{formatMoney(order.labor)}</Detail>
            <Detail label="Peças">{formatMoney(order.parts)}</Detail>
            <Detail label="Total">
              <strong className="text-lg">{formatMoney(total)}</strong>
            </Detail>
            <Detail label="Custo">{formatMoney(order.cost)}</Detail>
            <Detail label="Lucro">
              {formatMoney(order.profit ?? total - Number(order.cost || 0))}
            </Detail>
            <Detail label="Recebido">{formatMoney(received)}</Detail>
            <Detail label="Saldo a receber">
              <strong>{formatMoney(balance)}</strong>
            </Detail>
            {received > total && (
              <Detail label="Recebido acima do total">{formatMoney(received - total)}</Detail>
            )}
            {order.payment ? (
              <>
                <Detail label="Forma de pagamento">
                  {order.payment.method || 'Não informada'}
                </Detail>
                <Detail label="Data do recebimento">{date(order.payment.date)}</Detail>
              </>
            ) : (
              <Detail label="Pagamento">Nenhum recebimento registrado.</Detail>
            )}
          </dl>
        </section>
      </aside>
    </div>
  );
}

export default function OrderDetailsDialog({
  order,
  close,
  onEdit,
  onCharge,
}: {
  order: OrderRow;
  close: () => void;
  onEdit: () => void;
  onCharge: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Ordem {order.code}</DialogTitle>
          <DialogDescription>Dados do atendimento e do aparelho.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <OrderDetails order={order} />
        </div>
        <DialogFooter className="shrink-0 flex-wrap border-t bg-background p-4">
          <Button variant="outline" asChild>
            <Link
              href={`/ordens/${encodeURIComponent(order.id)}/imprimir`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer aria-hidden="true" />
              Imprimir
            </Link>
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Editar OS
          </Button>
          {!order.payment && Number(order.total || 0) > 0 && order.status !== 'Cancelado' && (
            <Button onClick={onCharge}>Registrar recebimento</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
