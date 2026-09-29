'use client';

import Link from 'next/link';
import { useState } from 'react';
import ClientModal, {
  clientStatuses,
  type ClientRow,
  type SaveClient,
} from '@/components/client-modal';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Client, ClientStatus } from '@/lib/types';

export function clientStatusVariant(status: string | undefined) {
  if (status === 'Em atendimento') return 'default';
  if (status === 'Concluído') return 'success';
  if (status === 'Aguardando') return 'warning';
  return 'secondary';
}

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
  const visible = clients.filter((client) =>
    `${client.name} ${client.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const metrics = [
    { title: 'Clientes', value: clients.length, detail: 'Cadastrados diretamente' },
    {
      title: 'Em atendimento',
      value: clients.filter((client) => client.status === 'Em atendimento').length,
      detail: 'Com acompanhamento',
    },
    {
      title: 'Concluídos',
      value: clients.filter((client) => client.status === 'Concluído').length,
      detail: 'Atendimentos finalizados',
    },
    { title: 'VIP', value: clients.filter((client) => client.vip).length, detail: 'Prioritários' },
  ];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Consulte contatos, acompanhe atendimentos e mantenha os dados atualizados."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Novo cliente
            </Button>
          </div>
        }
      />

      <section aria-label="Resumo de clientes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              <p className="text-2xl font-semibold tabular-nums">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {clients.length ? (
        <>
          <Card className="my-4">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Diretório de clientes</CardTitle>
                <CardDescription>Busque pelo nome ou telefone cadastrado.</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{visible.length}</span> de{' '}
                  {clients.length} clientes
                </p>
                {search && (
                  <Button onClick={() => setSearch('')} size="sm" variant="ghost">
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid max-w-md gap-2">
                <label className="text-sm font-medium" htmlFor="client-search">
                  Buscar clientes
                </label>
                <Input
                  autoComplete="off"
                  id="client-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou telefone"
                  value={search}
                />
              </div>
            </CardContent>
          </Card>

          {visible.length ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Clientes</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {visible.length} {visible.length === 1 ? 'cadastro' : 'cadastros'}
                </span>
              </CardHeader>
              <CardContent>
                <ul aria-label="Clientes encontrados" className="grid gap-3 md:hidden">
                  {visible.map((client) => (
                    <li key={client.id}>
                      <Card className="gap-3" size="sm">
                        <CardContent className="grid gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold">{client.name}</h3>
                              {client.vip && <Badge variant="warning">VIP</Badge>}
                            </div>
                            <ClientStatusControl client={client} onChange={change} />
                          </div>
                          <div className="min-w-0 text-sm">
                            <p className="truncate font-medium">{client.phone}</p>
                            {client.email && (
                              <p className="truncate text-muted-foreground">{client.email}</p>
                            )}
                          </div>
                          <div className="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
                            <p>Documento: {client.document || 'não informado'}</p>
                            <p className="line-clamp-2">Observações: {client.notes || 'nenhuma'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 border-t pt-3">
                            <Button onClick={() => chat(client)} size="sm">
                              Conversar
                            </Button>
                            <Button onClick={() => edit(client)} size="sm" variant="outline">
                              Editar
                            </Button>
                            <Button onClick={() => void remove(client)} size="sm" variant="ghost">
                              Excluir
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>

                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Observações</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell>
                            <div className="grid gap-1">
                              <span className="font-medium">{client.name}</span>
                              {client.vip && (
                                <Badge className="w-fit" variant="warning">
                                  VIP
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="grid gap-1">
                              <span>{client.phone}</span>
                              {client.email && (
                                <span className="text-xs text-muted-foreground">
                                  {client.email}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{client.document || '—'}</TableCell>
                          <TableCell>
                            <ClientStatusControl client={client} onChange={change} />
                          </TableCell>
                          <TableCell className="max-w-56 truncate">{client.notes || '—'}</TableCell>
                          <TableCell>
                            <Button onClick={() => chat(client)} size="sm" variant="outline">
                              Conversar
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button onClick={() => edit(client)} size="sm" variant="ghost">
                                Editar
                              </Button>
                              <Button onClick={() => void remove(client)} size="sm" variant="ghost">
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              description="Tente buscar por outro nome ou telefone."
              title="Nenhum cliente encontrado"
            />
          )}
        </>
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

function ClientStatusControl({
  client,
  onChange,
}: {
  client: ClientRow;
  onChange: (client: ClientRow, status: ClientStatus) => void;
}) {
  const status = client.status || 'Novo';
  return (
    <div className="flex items-center gap-1">
      <Badge variant={clientStatusVariant(status)}>{status}</Badge>
      <Select value={status} onValueChange={(value) => onChange(client, value as ClientStatus)}>
        <SelectTrigger
          aria-label={`Alterar status de ${client.name}`}
          className="size-8 p-0"
          size="sm"
        >
          <SelectValue className="sr-only" />
        </SelectTrigger>
        <SelectContent>
          {clientStatuses.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
