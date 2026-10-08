'use client';

import Link from 'next/link';
import { MessageCircle, Star, Wrench } from 'lucide-react';
import { ClientForm, type ClientRow, type SaveClient } from '@/components/client-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RecordDialog, { RecordField, RecordSection } from '@/components/ui/record-dialog';
import { hasValidWhatsapp } from '@/lib/format';
import { badgeFor, clientStatusTone } from '@/lib/status-tones';

const brDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(parsed);
};

/** Ficha do cliente: abre para ver; "Editar" troca para o formulário na mesma janela. */
export default function ClientRecordDialog({
  client,
  close,
  save,
  startEditing = false,
  onChat,
}: {
  client: ClientRow;
  close: () => void;
  save: SaveClient;
  startEditing?: boolean;
  onChat: () => void;
}) {
  const status = client.status || 'Novo';
  return (
    <RecordDialog
      actions={
        <Button asChild variant="outline">
          <Link href={`/ordens?busca=${encodeURIComponent(client.name)}`}>
            <Wrench aria-hidden="true" />
            Ver ordens
          </Link>
        </Button>
      }
      badge={
        <>
          <Badge variant={badgeFor(clientStatusTone(status))}>{status}</Badge>
          {client.vip && (
            <Badge variant="warning">
              <Star aria-hidden="true" />
              VIP
            </Badge>
          )}
        </>
      }
      close={close}
      description={client.phone || 'Sem WhatsApp cadastrado'}
      primary={
        hasValidWhatsapp(client.phone) && (
          <Button onClick={onChat}>
            <MessageCircle aria-hidden="true" />
            Conversar
          </Button>
        )
      }
      renderEdit={(controls) => (
        <ClientForm
          item={client}
          markDirty={controls.markDirty}
          onCancel={controls.cancel}
          onSaved={controls.saved}
          save={save}
        />
      )}
      startEditing={startEditing}
      title={client.name}
    >
      <div className="grid gap-6">
        <RecordSection title="Contato">
          <RecordField label="WhatsApp">{client.phone || 'Não informado'}</RecordField>
          <RecordField label="E-mail">{client.email || 'Não informado'}</RecordField>
          <RecordField label="CPF / CNPJ">{client.document || 'Não informado'}</RecordField>
          <RecordField label="Data de nascimento">
            {brDate(client.birth) || 'Não informada'}
          </RecordField>
          <RecordField className="sm:col-span-2" label="Endereço">
            {client.address || 'Não informado'}
          </RecordField>
        </RecordSection>
        <RecordSection columns={1} title="Observações">
          <RecordField label="Anotações sobre o cliente">
            {client.notes || 'Nenhuma observação'}
          </RecordField>
        </RecordSection>
        <p className="text-xs text-muted-foreground">
          {client.automatic ? 'Cadastrado automaticamente por uma OS' : 'Cadastrado manualmente'}
          {brDate(client.createdAt) ? ` em ${brDate(client.createdAt)}` : ''}.
        </p>
      </div>
    </RecordDialog>
  );
}
