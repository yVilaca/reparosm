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
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/format';
import type { Quote } from '@/lib/types';

export type QuoteRow = Quote & { id: string };
export type SaveQuote = (data: Quote, id?: string) => Promise<void>;

type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type QuoteForm = {
  code: string;
  customer: string;
  phone: string;
  device: string;
  problem: string;
  service: string;
  notes: string;
  validUntil: string;
};

const formFrom = (item?: QuoteRow): QuoteForm => ({
  code: item?.code || '',
  customer: item?.customer || '',
  phone: item?.phone || '',
  device: item?.device || '',
  problem: item?.problem || '',
  service: item?.service || '',
  notes: item?.notes || '',
  validUntil: item?.validUntil || '',
});

export default function QuoteModal({
  item,
  close,
  save,
}: {
  item?: QuoteRow;
  close: () => void;
  save: SaveQuote;
}) {
  const [form, setForm] = useState(() => formFrom(item));
  const [labor, setLabor] = useState(() => Number(item?.labor || 0));
  const [parts, setParts] = useState(() => Number(item?.parts || 0));
  const [saving, setSaving] = useState(false);
  const field = (key: keyof QuoteForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await save(
        {
          ...form,
          code: form.code || `ORC-${Date.now().toString().slice(-5)}`,
          labor,
          parts,
          total: labor + parts,
          status: item?.status || 'Aguardando',
          ...(item ? { updatedAt: now } : { createdAt: now }),
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
      <DialogContent className="max-w-xl p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar orçamento ${item?.code}` : 'Novo orçamento'}
            </DialogTitle>
            <DialogDescription>Gere um link para aprovação do cliente.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-customer">Cliente *</Label>
              <Input
                id="quote-customer"
                onChange={field('customer')}
                required
                value={form.customer}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-phone">WhatsApp *</Label>
              <Input
                id="quote-phone"
                onChange={field('phone')}
                placeholder="(DDD) número"
                required
                value={form.phone}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-device">Celular *</Label>
            <Input
              id="quote-device"
              onChange={field('device')}
              placeholder="Marca e modelo"
              required
              value={form.device}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-problem">Problema relatado *</Label>
            <Textarea
              id="quote-problem"
              onChange={field('problem')}
              placeholder="Ex.: Aparelho não liga e não carrega"
              required
              value={form.problem}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-service">Serviço proposto *</Label>
            <Textarea
              id="quote-service"
              onChange={field('service')}
              placeholder="Descreva o diagnóstico e o que será realizado"
              required
              value={form.service}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-notes">Observações para o cliente</Label>
            <Textarea
              id="quote-notes"
              onChange={field('notes')}
              placeholder="Condições, prazo, qualidade da peça, garantia ou recomendações"
              value={form.notes}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-labor">Mão de obra</Label>
              <Input
                id="quote-labor"
                min="0"
                onChange={(event) => setLabor(Number(event.target.value))}
                step="0.01"
                type="number"
                value={labor}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-parts">Peças</Label>
              <Input
                id="quote-parts"
                min="0"
                onChange={(event) => setParts(Number(event.target.value))}
                step="0.01"
                type="number"
                value={parts}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="quote-valid-until">Válido até</Label>
            <Input
              id="quote-valid-until"
              onChange={field('validUntil')}
              type="date"
              value={form.validUntil}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total do orçamento</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatMoney(labor + parts)}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar e gerar link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
