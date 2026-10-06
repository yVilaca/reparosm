'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Expense, Payment } from '@/lib/types';
import { parseMoney } from '@/lib/quick-sale';
import { todayInSaoPaulo } from '@/lib/warranty';

export type MoneyKind = 'payment' | 'expense';
export type MoneyData = Payment | Expense;
export type MoneyRow = MoneyData & { id: string; kind: MoneyKind };
export type SaveMoney = (kind: MoneyKind, data: MoneyData, id?: string) => Promise<void>;

const methods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto'];

type FieldChange = ChangeEvent<HTMLInputElement>;
type MoneyForm = {
  description: string;
  reference: string;
  method: string;
  date: string;
  value: string;
};

const formFrom = (item?: MoneyRow): MoneyForm => ({
  description: item?.description || '',
  reference: item?.reference || '',
  method: item?.method || 'Pix',
  date: item?.date || todayInSaoPaulo(),
  value: item?.value === undefined ? '' : String(item.value),
});

export default function MoneyModal({
  kind,
  item,
  close,
  save,
}: {
  kind: MoneyKind;
  item?: MoneyRow;
  close: () => void;
  save: SaveMoney;
}) {
  const receive = kind === 'payment';
  const [form, setForm] = useState(() => formFrom(item));
  const [saving, setSaving] = useState(false);
  const field = (key: keyof MoneyForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await save(
        kind,
        {
          description: form.description.trim(),
          reference: form.reference.trim(),
          method: form.method,
          date: form.date,
          value: parseMoney(form.value),
          ...(item
            ? { createdAt: item.createdAt, updatedAt: new Date().toISOString() }
            : { createdAt: new Date().toISOString() }),
        },
        item?.id,
      );
    } finally {
      setSaving(false);
    }
  };
  const editing = Boolean(item);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? 'Editar lançamento'
                : receive
                  ? 'Registrar recebimento'
                  : 'Registrar despesa'}
            </DialogTitle>
            <DialogDescription>Lançamento no controle financeiro.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="money-description">Descrição *</Label>
            <Input
              id="money-description"
              onChange={field('description')}
              placeholder={receive ? 'Ex.: Pagamento OS-1024' : 'Ex.: Compra de componentes'}
              required
              value={form.description}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="money-reference">Referência</Label>
            <Input
              id="money-reference"
              onChange={field('reference')}
              placeholder="OS, cliente, fornecedor ou documento"
              value={form.reference}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="money-method">Forma</Label>
              <Select
                onValueChange={(value) => setForm((current) => ({ ...current, method: value }))}
                value={form.method}
              >
                <SelectTrigger id="money-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="money-date">Data</Label>
              <Input
                id="money-date"
                onChange={field('date')}
                required
                type="date"
                value={form.date}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="money-value">Valor *</Label>
            <MaskedInput
              mask="currency"
              id="money-value"
              onChange={field('value')}
              required
              value={form.value}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : 'Salvar lançamento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
