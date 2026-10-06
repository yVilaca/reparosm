'use client';

import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StockCheck, StockShortage } from '@/components/use-stock-check';

export function StockCheckStatus({
  checking,
  error,
  shortages,
  retry,
  className,
}: {
  checking: boolean;
  error?: string;
  shortages: StockShortage[];
  retry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('grid gap-1 text-xs sm:col-span-2', className)}
      role="status"
      aria-live="polite"
    >
      {checking ? (
        <p className="text-muted-foreground">Verificando estoque…</p>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Verificar novamente
          </Button>
        </div>
      ) : (
        shortages.map((item) => (
          <p className="text-amber-700 dark:text-amber-300" key={item.id}>
            {item.name}: disponível {item.available}, solicitado {item.quantity}. Estoque
            insuficiente.
          </p>
        ))
      )}
    </div>
  );
}

export default function StockAlertDialog({
  alert,
  onDecision,
}: {
  alert: { check: StockCheck; shortages: StockShortage[] } | null;
  onDecision: (approved: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => !open && onDecision(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estoque insuficiente</DialogTitle>
          <DialogDescription>
            {alert?.check.allowNegativeStock
              ? 'A loja permite estoque negativo. Confirme para continuar com as quantidades informadas.'
              : 'A loja não permite vender com estoque negativo. Volte e ajuste as quantidades ou reponha o estoque.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2 text-sm">
          {alert?.shortages.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>: disponível {item.available}, solicitado {item.quantity}.
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onDecision(false)}>
            Voltar às quantidades
          </Button>
          {alert?.check.allowNegativeStock && (
            <Button type="button" onClick={() => onDecision(true)}>
              Continuar com estoque negativo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
