'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Expense, Payment } from '@/lib/types';

export type MoneyKind = 'payment' | 'expense';
export type MoneyData = Payment | Expense;
export type MoneyRow = MoneyData & { id: string; kind: MoneyKind };
export type SaveMoney = (kind: MoneyKind, data: MoneyData, id?: string) => Promise<void>;

type FieldChange = ChangeEvent<HTMLInputElement | HTMLSelectElement>;
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
  date: item?.date || new Date().toISOString().slice(0, 10),
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
          value: Number(form.value),
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
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>{receive ? '↗' : '↘'}</span>
            <div>
              <h2>
                {editing
                  ? 'Editar lançamento'
                  : receive
                    ? 'Registrar recebimento'
                    : 'Registrar despesa'}
              </h2>
              <p>Lançamento no controle financeiro</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Descrição *
          <input
            value={form.description}
            onChange={field('description')}
            required
            placeholder={receive ? 'Ex.: Pagamento OS-1024' : 'Ex.: Compra de componentes'}
          />
        </label>
        <label>
          Referência
          <input
            value={form.reference}
            onChange={field('reference')}
            placeholder="OS, cliente, fornecedor ou documento"
          />
        </label>
        <div className="form-row">
          <label>
            Forma
            <select value={form.method} onChange={field('method')}>
              <option>Pix</option>
              <option>Dinheiro</option>
              <option>Cartão de débito</option>
              <option>Cartão de crédito</option>
              <option>Boleto</option>
            </select>
          </label>
          <label>
            Data
            <input value={form.date} onChange={field('date')} type="date" required />
          </label>
        </div>
        <label>
          Valor *
          <input
            value={form.value}
            onChange={field('value')}
            type="number"
            min="0.01"
            step="0.01"
            required
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar lançamento'}
          </button>
        </div>
      </form>
    </div>
  );
}
