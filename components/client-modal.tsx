'use client';

import { useState, type ChangeEvent } from 'react';
import type { Client, ClientStatus } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';
import { RecordForm } from '@/components/ui/record-dialog';

export type ClientRow = Client & { id: string };
export type SaveClient = (data: Client, id?: string) => Promise<void>;

type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
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

export const clientStatuses: ClientStatus[] = [
  'Novo',
  'Em atendimento',
  'Aguardando',
  'Concluído',
  'Inativo',
];

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

/** Campos do cliente. Usado na ficha (Editar) e na janela de cliente novo. */
export function ClientForm({
  item,
  save,
  onCancel,
  onSaved,
  markDirty,
}: {
  item?: ClientRow;
  save: SaveClient;
  onCancel: () => void;
  onSaved: () => void;
  markDirty?: () => void;
}) {
  const [form, setForm] = useState(() => formFrom(item));
  const [vip, setVip] = useState(item?.vip === true);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ClientForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async () => {
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
      onSaved();
    } catch {
      // A tela já avisou o motivo; o formulário continua aberto para corrigir.
    } finally {
      setSaving(false);
    }
  };
  return (
    <RecordForm
      markDirty={markDirty}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      submitLabel={item ? 'Salvar alterações' : 'Cadastrar cliente'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="client-name">Nome completo *</Label>
          <Input
            autoComplete="name"
            id="client-name"
            onChange={field('name')}
            required
            value={form.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="client-phone">WhatsApp</Label>
          <MaskedInput
            mask="phone"
            autoComplete="tel"
            id="client-phone"
            onChange={field('phone')}
            value={form.phone}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="client-email">E-mail</Label>
          <Input
            autoComplete="email"
            id="client-email"
            onChange={field('email')}
            type="email"
            value={form.email}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="client-document">CPF / CNPJ</Label>
          <MaskedInput
            mask="document"
            id="client-document"
            onChange={field('document')}
            value={form.document}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="client-birth">Data de nascimento</Label>
          <Input id="client-birth" onChange={field('birth')} type="date" value={form.birth} />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="client-address">Endereço</Label>
          <Input
            autoComplete="street-address"
            id="client-address"
            onChange={field('address')}
            value={form.address}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="client-status">{item ? 'Status' : 'Status inicial'}</Label>
          <Select
            onValueChange={(status) => {
              // O seletor não dispara o "change" do formulário: marca aqui.
              markDirty?.();
              setForm((current) => ({ ...current, status: status as ClientStatus }));
            }}
            value={form.status}
          >
            <SelectTrigger id="client-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clientStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 self-end rounded-lg border p-3">
          <Input
            checked={vip}
            className="size-4 shrink-0"
            id="client-vip"
            onChange={(event) => setVip(event.target.checked)}
            type="checkbox"
          />
          <Label htmlFor="client-vip">Marcar como cliente VIP</Label>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="client-notes">Observações</Label>
          <Textarea id="client-notes" onChange={field('notes')} value={form.notes} />
        </div>
      </div>
    </RecordForm>
  );
}

/** Janela de cliente novo. Para ver e editar um existente, use a ficha (ClientRecordDialog). */
export default function ClientModal({ close, save }: { close: () => void; save: SaveClient }) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Cadastro independente de ordem de serviço.</DialogDescription>
        </DialogHeader>
        <ClientForm onCancel={close} onSaved={close} save={save} />
      </DialogContent>
    </Dialog>
  );
}
