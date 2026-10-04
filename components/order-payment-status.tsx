import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type { OrderPayment } from '@/lib/types';
import { Banknote } from 'lucide-react';

export default function OrderPaymentStatus({
  order,
  onCharge,
}: {
  order: { total?: number; payment?: OrderPayment | null };
  onCharge?: () => void;
}) {
  const total = Number(order.total || 0);
  if (total <= 0) return null;
  if (!order.payment)
    return (
      onCharge && (
        <Button
          aria-label="Registrar recebimento"
          title="Registrar recebimento"
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          onClick={onCharge}
          size="icon"
          type="button"
          variant="outline"
        >
          <Banknote aria-hidden="true" />
        </Button>
      )
    );
  const matches = Number(order.payment.value) === total;
  return (
    <p className="text-sm text-muted-foreground">
      {matches
        ? `Recebido ${formatMoney(order.payment.value)}`
        : `Recebido ${formatMoney(order.payment.value)} de ${formatMoney(total)}`}
    </p>
  );
}
