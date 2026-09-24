'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Client, ClientStatus } from '@/lib/types';

export type ClientRow = Client & { id: string };
export type SaveClient = (data: Client, id?: string) => Promise<void>;

type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
type ClientForm = {
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  birth: string;
  status: ClientStatus;
  notes: string;
};

const statuses: ClientStatus[] = ['Novo', 'Em atendimento', 'Aguardando', 'Concluído', 'Inativo'];

const formFrom = (item?: ClientRow): ClientForm => ({
  name: item?.name || '',
  phone: item?.phone || '',
  email: item?.email || '',
  document: item?.document || '',
  address: item?.address || '',
  birth: item?.birth || '',
  status: item?.status || 'Novo',
  notes: item?.notes || '',
});

export default function ClientModal({
  item,
  close,
  save,
}: {
  item?: ClientRow;
  close: () => void;
  save: SaveClient;
}) {
  const [form, setForm] = useState(() => formFrom(item));
  const [vip, setVip] = useState(item?.vip === true);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ClientForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await save(
        {
          ...form,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          document: form.document.trim(),
          address: form.address.trim(),
          notes: form.notes.trim(),
          vip,
          ...(item
            ? { automatic: item.automatic, updatedAt: new Date().toISOString() }
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
            <span>◌</span>
            <div>
              <h2>{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
              <p>Cadastro independente de ordem de serviço</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome completo *
          <input value={form.name} onChange={field('name')} required />
        </label>
        <div className="form-row">
          <label>
            WhatsApp *
            <input value={form.phone} onChange={field('phone')} required />
          </label>
          <label>
            E-mail
            <input value={form.email} onChange={field('email')} type="email" />
          </label>
        </div>
        <div className="form-row">
          <label>
            CPF / CNPJ
            <input value={form.document} onChange={field('document')} />
          </label>
          <label>
            Data de nascimento
            <input value={form.birth} onChange={field('birth')} type="date" />
          </label>
        </div>
        <label>
          Endereço
          <input value={form.address} onChange={field('address')} />
        </label>
        <label>
          Status inicial
          <select value={form.status} onChange={field('status')}>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input checked={vip} onChange={(event) => setVip(event.target.checked)} type="checkbox" />{' '}
          Marcar como cliente VIP
        </label>
        <label>
          Observações
          <textarea value={form.notes} onChange={field('notes')} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
