'use client';

import { byName } from '@/lib/sorting';

import { useState } from 'react';
import ClientModal, {
  clientStatuses,
  type ClientRow,
  type SaveClient,
} from '@/components/client-modal';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/ui/page-header';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowMenu from '@/components/ui/row-menu';
import StatCard from '@/components/ui/stat-card';
import { toneChip } from '@/components/ui/tone';
import { MessageCircle, Plus, Search, Star, UserCheck, Users, Wrench } from 'lucide-react';
import { cn } from 'cn';
import { badgeFor, clientStatusTone } from '@/lib/status-tones';
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Client, ClientStatus } from '@/lib/types';

// Cores com significado fixo: veja lib/status-tones.ts.
export const clientStatusVariant = (status: string | undefined) =>
  badgeFor(clientStatusTone(status));

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

export default function ClientsRoute({ initialClients }: { initialClients: ClientRow[] }) {
  const { notify, confirm } = useFeedback();
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const save: SaveClient = async (data: Client, id?: string) => {
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Client };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o cliente.');
      const saved = { id: result.record.id, ...result.record.data };
      setClients((current) =>
        id ? current.map((client) => (client.id === id ? saved : client)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
      notify(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o cliente.',
        'error',
      );
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (client: ClientRow) => {
    setEditing(client);
    setModal('edit');
  };
  const remove = async (client: ClientRow) => {
    if (!(await confirm(`Excluir definitivamente o cliente ${client.name}?`))) return;
    try {
      const response = await fetch(`/api/clients?id=${encodeURIComponent(client.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o cliente.');
      setClients((current) => current.filter((item) => item.id !== client.id));
      notify('Cliente excluído.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
        'error',
      );
    }
  };
  const change = (client: ClientRow, status: ClientStatus) => {
    void save({ ...client, status }, client.id).catch(() => undefined);
  };
  const chat = (client: ClientRow) => {
    const message = `Olá, ${client.name}! Aqui é da ReparoSM. Como podemos ajudar?`;
    if (!hasValidWhatsapp(client.phone)) {
      notify('Cadastre um WhatsApp válido para este cliente.', 'error');
      return;
    }
    window.open(whatsappUrl(client.phone, message), '_blank', 'noopener,noreferrer');
    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          customer: client.name,
          phone: client.phone,
          kind: 'Contato direto',
          message,
          status: 'Aberto no WhatsApp',
          sentAt: new Date().toISOString(),
        },
      }),
    }).catch(() => undefined);
  };
  const visible = clients
    .filter((client) =>
      `${client.name} ${client.phone}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(byName);
  const count = (status: ClientStatus) =>
    clients.filter((client) => client.status === status).length;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Contatos, atendimentos e conversa pelo WhatsApp."
        action={
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Novo cliente
          </Button>
        }
      />

      <section
        aria-label="Resumo de clientes"
        className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <StatCard icon={Users} label="Clientes" value={clients.length} detail="Cadastrados" />
        <StatCard
          icon={Wrench}
          label="Em atendimento"
          tone="info"
          value={count('Em atendimento')}
          detail="Com aparelho na loja"
        />
        <StatCard
          icon={UserCheck}
          label="Concluídos"
          tone="success"
          value={count('Concluído')}
          detail="Atendimento finalizado"
        />
        <StatCard
          icon={Star}
          label="VIP"
          tone="warning"
          value={clients.filter((client) => client.vip).length}
          detail="Atendimento prioritário"
        />
      </section>

      {clients.length ? (
        <section aria-label="Clientes" className="grid gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {search ? (
                <>
                  <span className="font-medium text-foreground">{visible.length}</span> de{' '}
                  {clients.length} clientes
                </>
              ) : (
                `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`
              )}
            </p>
            <div className="relative sm:w-72">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Buscar clientes por nome ou telefone"
                autoComplete="off"
                className="pl-8"
                id="client-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome ou telefone"
                type="search"
                value={search}
              />
            </div>
          </div>

          {visible.length ? (
            <>
              <ul
                aria-label="Clientes encontrados"
                className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:hidden"
              >
                {visible.map((client) => (
                  <li className="grid gap-3 px-4 py-3" key={client.id}>
                    <ClientIdentity client={client} />
                    <div className="flex items-center justify-between gap-2 pl-11">
                      <ClientStatusControl client={client} onChange={change} />
                      <ClientActions
                        chat={chat}
                        client={client}
                        edit={edit}
                        remove={(item) => void remove(item)}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Observações</TableHead>
                      <TableHead className="pr-4 text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="pl-4">
                          <ClientIdentity client={client} />
                        </TableCell>
                        <TableCell>
                          <ClientStatusControl client={client} onChange={change} />
                        </TableCell>
                        <TableCell className="max-w-64 truncate text-muted-foreground">
                          {client.notes || '—'}
                        </TableCell>
                        <TableCell className="pr-4">
                          <ClientActions
                            chat={chat}
                            client={client}
                            edit={edit}
                            remove={(item) => void remove(item)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              description="Tente buscar por outro nome ou telefone."
              title="Nenhum cliente encontrado"
            />
          )}
        </section>
      ) : (
        <EmptyState
          action={<Button onClick={create}>Cadastrar cliente</Button>}
          description="Você pode cadastrar clientes mesmo sem criar uma ordem de serviço."
          title="Nenhum cliente cadastrado"
        />
      )}

      {modal === 'create' && <ClientModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <ClientModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}

function ClientIdentity({ client }: { client: ClientRow }) {
  const contact = [client.phone, client.email, client.document].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
          toneChip.neutral,
        )}
      >
        {initials(client.name)}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{client.name}</span>
          {client.vip && (
            <Badge variant="warning">
              <Star aria-hidden="true" />
              VIP
            </Badge>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">{contact || 'Sem contato'}</p>
      </div>
    </div>
  );
}

function ClientActions({
  client,
  chat,
  edit,
  remove,
}: {
  client: ClientRow;
  chat: (client: ClientRow) => void;
  edit: (client: ClientRow) => void;
  remove: (client: ClientRow) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button onClick={() => chat(client)} size="sm" variant="outline">
        <MessageCircle aria-hidden="true" />
        Conversar
      </Button>
      <RowMenu label={client.name}>
        <DropdownMenuItem onSelect={() => edit(client)}>Editar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => remove(client)} variant="destructive">
          Excluir
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}

/** O status é a própria etiqueta: clicar nela troca o status. */
function ClientStatusControl({
  client,
  onChange,
}: {
  client: ClientRow;
  onChange: (client: ClientRow, status: ClientStatus) => void;
}) {
  const status = client.status || 'Novo';
  return (
    <Select value={status} onValueChange={(value) => onChange(client, value as ClientStatus)}>
      <SelectTrigger
        aria-label={`Status de ${client.name}: ${status}. Alterar`}
        className={cn(
          'h-6 w-fit gap-1 rounded-full border-transparent px-2.5 text-xs font-medium shadow-none',
          toneChip[clientStatusTone(status)],
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {clientStatuses.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
