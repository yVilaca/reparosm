'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Client, ClientStatus } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';

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
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl p-0">
        <form className="grid max-h-[90dvh] gap-6 overflow-y-auto p-6" onSubmit={submit}>
          <DialogHeader className="pr-8">
            <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>Cadastro independente de ordem de serviço.</DialogDescription>
          </DialogHeader>

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
              <Label htmlFor="client-status">Status inicial</Label>
              <Select
                onValueChange={(status) =>
                  setForm((current) => ({ ...current, status: status as ClientStatus }))
                }
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

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
