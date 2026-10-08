'use client';

import { useState, type ChangeEvent } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { RecordForm } from '@/components/ui/record-dialog';
import { formatMoney } from '@/lib/format';
import { parseMoney } from '@/lib/quick-sale';
import type { Quote } from '@/lib/types';

export type QuoteRow = Quote & { id: string };
export type SaveQuote = (data: Quote, id?: string) => Promise<void>;
const parseInputMoney = (value: string) => {
  const parsed = parseMoney(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

/**
 * Campos do orçamento. Usado na ficha (Editar) e na janela de orçamento novo.
 */
export function QuoteForm({
  item,
  save,
  onCancel,
  onSaved,
  markDirty,
}: {
  item?: QuoteRow;
  save: SaveQuote;
  onCancel: () => void;
  onSaved: () => void;
  markDirty?: () => void;
}) {
  const [form, setForm] = useState(() => formFrom(item));
  const [laborText, setLaborText] = useState(() => String(item?.labor ?? ''));
  const [partsText, setPartsText] = useState(() => String(item?.parts ?? ''));
  const [saving, setSaving] = useState(false);
  const labor = parseInputMoney(laborText);
  const parts = parseInputMoney(partsText);
  const field = (key: keyof QuoteForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async () => {
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
      onSaved();
    } catch {
      // A tela já avisou o motivo; o formulário continua aberto para corrigir.
    } finally {
      setSaving(false);
    }
  };
  return (
    <RecordForm
      footer={
        <p className="text-sm text-muted-foreground">
          Total{' '}
          <strong className="ml-1 text-base text-foreground tabular-nums">
            {formatMoney(labor + parts)}
          </strong>
        </p>
      }
      markDirty={markDirty}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      submitLabel={item ? 'Salvar alterações' : 'Criar e gerar link'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="quote-customer">Cliente *</Label>
          <Input id="quote-customer" onChange={field('customer')} required value={form.customer} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="quote-phone">WhatsApp *</Label>
          <MaskedInput
            mask="phone"
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
          <MaskedInput
            mask="currency"
            id="quote-labor"
            onChange={(event) => {
              setLaborText(event.target.value);
            }}
            value={laborText}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="quote-parts">Peças</Label>
          <MaskedInput
            mask="currency"
            id="quote-parts"
            onChange={(event) => {
              setPartsText(event.target.value);
            }}
            value={partsText}
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
    </RecordForm>
  );
}

/** Janela de orçamento novo. Para ver e editar um existente, use a ficha (QuoteRecordDialog). */
export default function QuoteModal({ close, save }: { close: () => void; save: SaveQuote }) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Novo orçamento</DialogTitle>
          <DialogDescription>Gere um link para aprovação do cliente.</DialogDescription>
        </DialogHeader>
        <QuoteForm onCancel={close} onSaved={close} save={save} />
      </DialogContent>
    </Dialog>
  );
}
