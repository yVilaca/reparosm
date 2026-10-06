'use client';

import { useState, type FormEvent } from 'react';
import { Copy } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaskedInput } from '@/components/ui/masked-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/format';
import { parseMoney } from '@/lib/quick-sale';
import { dueLabel } from '@/lib/payable-schedule';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { Payable } from '@/lib/types';
import type { PayableRecord } from '@/lib/repos/payables';

export type PayableRow = Payable & { id: string };
export type PaidResult = { record: PayableRecord; nextRecord?: PayableRecord };

export async function copyPaymentCode(code: string, notify: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(code);
    notify('Código copiado. Cole no app do banco.');
  } catch {
    notify('Não foi possível copiar. Selecione o código e copie manualmente.');
  }
}

/** Diferença entre o que foi pago e o valor da conta, em palavras. */
export function paymentDifference(amount: number, paid: number) {
  const cents = Math.round(paid * 100) - Math.round(amount * 100);
  if (!Number.isFinite(cents) || cents === 0) return null;
  return cents > 0
    ? `${formatMoney(cents / 100)} de juros ou multa`
    : `${formatMoney(-cents / 100)} de desconto`;
}

export default function PayablePayDialog({
  payable,
  suggestedMethod,
  close,
  paid,
}: {
  payable: PayableRow;
  suggestedMethod?: string;
  close: () => void;
  paid: (result: PaidResult) => void;
}) {
  const { notify } = useFeedback();
  const today = todayInSaoPaulo();
  const [amount, setAmount] = useState(payable.amount.toFixed(2));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<string>(
    PAYMENT_METHODS.find((item) => item === suggestedMethod) || 'Pix',
  );
  const [saving, setSaving] = useState(false);
  const value = parseMoney(amount);
  const valid = Number.isFinite(value) && value > 0 && Boolean(paidOn) && paidOn <= today;
  const difference = valid ? paymentDifference(payable.amount, value) : null;
  const details = [
    payable.supplier,
    payable.installmentCount
      ? `Parcela ${payable.installmentNumber} de ${payable.installmentCount}`
      : null,
    dueLabel(payable.dueDate, today),
  ].filter(Boolean);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !valid) return;
    setSaving(true);
    try {
      const response = await fetch('/api/payables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payable.id, action: 'pay', amount: value, paidOn, method }),
      });
      const result = (await response.json()) as Partial<PaidResult> & { error?: string };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível pagar a conta.');
      paid(result as PaidResult);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível pagar a conta.', 'error');
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && !saving && close()} open>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Pagar {payable.description}</DialogTitle>
            <DialogDescription>{details.join(' · ')}</DialogDescription>
          </DialogHeader>
          {payable.paymentCode && (
            <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Código de pagamento</p>
              <p className="font-mono text-sm break-all">{payable.paymentCode}</p>
              <Button
                className="justify-self-start"
                onClick={() => void copyPaymentCode(payable.paymentCode!, notify)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy aria-hidden="true" />
                Copiar código
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payable-paid-amount">Valor pago (R$)</Label>
              <MaskedInput
                mask="currency"
                autoFocus
                id="payable-paid-amount"
                onChange={(event) => setAmount(event.target.value)}
                required
                value={amount}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payable-paid-on">Data do pagamento</Label>
              <Input
                id="payable-paid-on"
                max={today}
                onChange={(event) => setPaidOn(event.target.value)}
                required
                type="date"
                value={paidOn}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
            {difference
              ? `Valor da conta: ${formatMoney(payable.amount)} · ${difference}.`
              : paidOn > today
                ? 'A data do pagamento não pode ser no futuro.'
                : 'Mude o valor se pagou com juros, multa ou desconto.'}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="payable-paid-method">Forma de pagamento</Label>
            <Select onValueChange={setMethod} value={method}>
              <SelectTrigger className="w-full" id="payable-paid-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            A saída entra no Caixa com este valor e esta data.
            {payable.recurrence && ' A próxima conta da repetição é criada em seguida.'}
          </p>
          <DialogFooter>
            <Button disabled={saving} onClick={close} type="button" variant="outline">
              Agora não
            </Button>
            <Button disabled={saving || !valid} type="submit">
              {saving ? 'Pagando…' : valid ? `Pagar ${formatMoney(value)}` : 'Pagar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
