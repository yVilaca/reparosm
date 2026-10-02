import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type { OrderPayment } from '@/lib/types';

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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-amber-700 dark:text-amber-300">Pagamento pendente</span>
        {onCharge && (
          <Button onClick={onCharge} size="sm" type="button" variant="outline">
            Registrar recebimento
          </Button>
        )}
      </div>
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
