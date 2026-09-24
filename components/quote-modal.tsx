'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
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
    <div className="modal-backdrop">
      <form className="modal quote-modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>▤</span>
            <div>
              <h2>{editing ? `Editar orçamento ${item?.code}` : 'Novo orçamento'}</h2>
              <p>Gere um link para aprovação do cliente</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <div className="form-row">
          <label>
            Cliente *<input value={form.customer} onChange={field('customer')} required />
          </label>
          <label>
            WhatsApp *
            <input
              value={form.phone}
              onChange={field('phone')}
              required
              placeholder="(DDD) número"
            />
          </label>
        </div>
        <label>
          Celular *
          <input
            value={form.device}
            onChange={field('device')}
            required
            placeholder="Marca e modelo"
          />
        </label>
        <label>
          Problema relatado *
          <textarea
            value={form.problem}
            onChange={field('problem')}
            required
            placeholder="Ex.: Aparelho não liga e não carrega"
          />
        </label>
        <label>
          Serviço proposto *
          <textarea
            value={form.service}
            onChange={field('service')}
            required
            placeholder="Descreva o diagnóstico e o que será realizado"
          />
        </label>
        <label>
          Observações para o cliente
          <textarea
            value={form.notes}
            onChange={field('notes')}
            placeholder="Condições, prazo, qualidade da peça, garantia ou recomendações"
          />
        </label>
        <div className="form-row">
          <label>
            Mão de obra
            <input
              type="number"
              min="0"
              step="0.01"
              value={labor}
              onChange={(event) => setLabor(Number(event.target.value))}
            />
          </label>
          <label>
            Peças
            <input
              type="number"
              min="0"
              step="0.01"
              value={parts}
              onChange={(event) => setParts(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Válido até
          <input value={form.validUntil} onChange={field('validUntil')} type="date" />
        </label>
        <div className="order-total">
          <span>Total do orçamento</span>
          <strong>{formatMoney(labor + parts)}</strong>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar e gerar link'}
          </button>
        </div>
      </form>
    </div>
  );
}
