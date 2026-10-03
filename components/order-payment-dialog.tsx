'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/format';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { OrderPayment } from '@/lib/types';

const methods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto'];

export function OrderPaymentAmount({ total }: { total: number }) {
  return (
    <div className="grid gap-1 rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">Valor a receber</p>
      <strong className="text-2xl tabular-nums">{formatMoney(total)}</strong>
      <p className="text-xs text-muted-foreground">
        Para cobrar outro valor, altere o total da OS.
      </p>
    </div>
  );
}

export default function OrderPaymentDialog({
  order,
  close,
  saved,
}: {
  order: { id: string; code: string; total: number };
  close: () => void;
  saved: (payment: OrderPayment) => void;
}) {
  const { notify } = useFeedback();
  const [method, setMethod] = useState('Pix');
  const [date, setDate] = useState(todayInSaoPaulo());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, date }),
      });
      const result = (await response.json()) as { error?: string; payment?: OrderPayment | null };
      if (response.status === 409) {
        notify('Esta OS já teve o recebimento registrado em outra aba.', 'error');
        if (result.payment) saved(result.payment);
        else close();
        return;
      }
      if (!response.ok || !result.payment)
        throw new Error(result.error || 'Não foi possível registrar o recebimento.');
      notify('Recebimento registrado.', 'success');
      saved(result.payment);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível registrar o recebimento.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && close()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber {order.code}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <OrderPaymentAmount total={order.total} />
          <div className="grid gap-2">
            <Label htmlFor="order-payment-method">Forma de pagamento</Label>
            <Select onValueChange={setMethod} value={method}>
              <SelectTrigger className="w-full" id="order-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="order-payment-date">Data</Label>
            <Input
              id="order-payment-date"
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={close} type="button" variant="outline">
            Agora não
          </Button>
          <Button disabled={saving} onClick={submit} type="button">
            {saving ? 'Registrando...' : 'Confirmar recebimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
