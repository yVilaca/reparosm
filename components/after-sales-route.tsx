'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Automation, Client, Message, Order, Shop } from '@/lib/types';

type AutomationRow = Automation & { id: string };
type MessageRow = Message & { id: string };
type Contact = { id: string; name: string; phone?: string; device: string; status: string };
type SaveAfterSales = (
  type: 'automation' | 'message',
  data: Automation | Message,
  id?: string,
) => Promise<void>;

const templates = [
  [
    'Atualização do reparo',
    'Ao mudar a etapa',
    'Olá, {cliente}! Seu {aparelho} está na etapa: {status}.',
  ],
  [
    'Aparelho pronto',
    'Ao concluir o reparo',
    'Olá, {cliente}! Seu {aparelho} está pronto para retirada.',
  ],
  [
    'Avaliação no Google',
    '7 dias após a entrega',
    'Olá, {cliente}! Como ficou seu aparelho? Sua avaliação ajuda muito nossa assistência.',
  ],
  [
    'Acompanhamento',
    '24 horas após a entrega',
    'Olá, {cliente}! Passando para confirmar se está tudo funcionando perfeitamente.',
  ],
  [
    'Lembrete de garantia',
    '15 dias antes do fim',
    'Olá, {cliente}! Sua garantia está perto do vencimento. Se notar algo, fale conosco.',
  ],
] as const;

export default function AfterSalesRoute({
  initialAutomations,
  initialMessages,
  clients,
  orders,
  shop,
}: {
  initialAutomations: AutomationRow[];
  initialMessages: MessageRow[];
  clients: (Client & { id: string })[];
  orders: (Order & { id: string })[];
  shop?: Shop;
}) {
  const { notify } = useFeedback();
  const [automations, setAutomations] = useState(initialAutomations);
  const [messages, setMessages] = useState(initialMessages);
  const [target, setTarget] = useState('');
  const [template, setTemplate] = useState<string>(templates[0][0]);
  const [custom, setCustom] = useState('');
  const save: SaveAfterSales = async (type, data, id) => {
    try {
      const resource = type === 'automation' ? 'automations' : 'messages';
      const response = await fetch(`/api/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Automation | Message };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar.');
      if (type === 'automation') {
        const saved = { id: result.record.id, ...result.record.data } as AutomationRow;
        setAutomations((current) =>
          id
            ? current.map((automation) => (automation.id === id ? saved : automation))
            : [saved, ...current],
        );
      } else {
        setMessages((current) => [
          { id: result.record!.id, ...result.record!.data } as MessageRow,
          ...current,
        ]);
      }
      notify(
        type === 'automation'
          ? id
            ? 'Automação atualizada.'
            : 'Automação ativada.'
          : 'Mensagem registrada no histórico.',
        'success',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
      throw error;
    }
  };
  const contacts: Contact[] = [
    ...clients.map((client) => ({
      id: `c-${client.id}`,
      name: client.name,
      phone: client.phone,
      device: 'seu aparelho',
      status: client.status || 'Em atendimento',
    })),
    ...orders
      .filter((order) => order.phone)
      .map((order) => ({
        id: `o-${order.id}`,
        name: order.customer,
        phone: order.phone,
        device: order.device,
        status: order.stage || 'Recebido',
      })),
  ];
  const selected = contacts.find((contact) => contact.id === target);
  const current = templates.find((item) => item[0] === template) || templates[0];
  const templateMessage = (item: (typeof templates)[number]) =>
    item[0] === 'Avaliação no Google' && shop?.google ? `${item[2]} ${shop.google}` : item[2];
  const messageTemplate = templateMessage(current);
  const text = (custom || messageTemplate)
    .replaceAll('{cliente}', selected?.name || 'cliente')
    .replaceAll('{aparelho}', selected?.device || 'seu aparelho')
    .replaceAll('{status}', selected?.status || 'em atendimento');
  const existing = (name: string) => automations.find((item) => item.name === name);
  const toggle = (item: (typeof templates)[number]) => {
    const old = existing(item[0]);
    void save(
      'automation',
      { name: item[0], schedule: item[1], message: templateMessage(item), enabled: !old?.enabled },
      old?.id,
    ).catch(() => undefined);
  };
  const send = () => {
    if (!selected) {
      notify('Escolha um cliente ou uma ordem.', 'error');
      return;
    }
    if (!hasValidWhatsapp(selected.phone || '')) {
      notify('O contato escolhido não possui um WhatsApp válido.', 'error');
      return;
    }
    window.open(whatsappUrl(selected.phone || '', text), '_blank', 'noopener,noreferrer');
    void save('message', {
      customer: selected.name,
      phone: selected.phone || '',
      kind: template,
      message: text,
      status: 'Aberto no WhatsApp',
      sentAt: new Date().toISOString(),
    }).catch(() => undefined);
  };
  return (
    <>
      <PageHeader
        title="Pós-venda"
        description="Mensagens e automações carregadas no servidor para a conta atual."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <Card className="mb-4 gap-3 bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Central do WhatsApp
            </p>
            <h2 className="text-lg font-semibold">Prepare, envie e acompanhe mensagens</h2>
            <p className="text-sm opacity-90">Envio manual com um clique, direto pelo WhatsApp.</p>
          </div>
          <div className="text-right">
            <strong className="text-2xl">{messages.length}</strong>
            <p className="text-sm opacity-90">contatos registrados</p>
          </div>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Nova mensagem</CardTitle>
          <CardDescription>
            A mensagem abre pronta no WhatsApp para você confirmar o envio.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="after-sales-target">Cliente ou ordem</Label>
              <div className="flex gap-2">
                <Select onValueChange={setTarget} value={target}>
                  <SelectTrigger className="min-w-0 flex-1" id="after-sales-target">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name} · {contact.device}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  aria-label="Limpar contato selecionado"
                  disabled={!target}
                  onClick={() => setTarget('')}
                  type="button"
                  variant="outline"
                >
                  Limpar
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="after-sales-template">Modelo de mensagem</Label>
              <Select
                onValueChange={(value) => {
                  setTemplate(value);
                  setCustom('');
                }}
                value={template}
              >
                <SelectTrigger className="w-full" id="after-sales-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((item) => (
                    <SelectItem key={item[0]} value={item[0]}>
                      {item[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="after-sales-message">Mensagem</Label>
            <Textarea
              id="after-sales-message"
              onChange={(event) => setCustom(event.target.value)}
              value={custom || text}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
            <div>
              <p className="font-medium">{selected?.name || 'Escolha um contato'}</p>
              <p className="text-sm text-muted-foreground">
                {selected?.phone || 'O número aparecerá aqui'}
              </p>
            </div>
            <Button onClick={send} type="button">
              Abrir no WhatsApp →
            </Button>
          </div>
        </CardContent>
      </Card>
      <h2 className="mb-3 text-lg font-semibold">Automações preparadas</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((item, index) => {
          const enabled = !!existing(item[0])?.enabled;
          const toggleId = `automation-toggle-${index}`;
          return (
            <Card key={item[0]}>
              <CardContent className="grid gap-2">
                <p className="text-xs text-muted-foreground">{item[1]}</p>
                <h3 className="font-semibold">{item[0]}</h3>
                <p className="text-sm text-muted-foreground">{item[2]}</p>
                <div className="flex items-center gap-2 border-t pt-3">
                  <Input
                    checked={enabled}
                    className="size-4 shrink-0"
                    id={toggleId}
                    onChange={() => toggle(item)}
                    type="checkbox"
                  />
                  <Label className="font-normal" htmlFor={toggleId}>
                    {enabled ? 'Ativa para a API' : 'Ativar lembrete'}
                  </Label>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de mensagens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {messages
                .slice()
                .reverse()
                .slice(0, 10)
                .map((message) => (
                  <article className="grid gap-1 rounded-lg border p-4" key={message.id}>
                    <div className="flex items-center justify-between gap-2">
                      <strong>{message.customer}</strong>
                      <Badge variant="secondary">{message.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{message.phone}</p>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{message.kind}</span>
                      <span>{new Date(message.sentAt || '').toLocaleString('pt-BR')}</span>
                    </div>
                  </article>
                ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages
                    .slice()
                    .reverse()
                    .slice(0, 10)
                    .map((message) => (
                      <TableRow key={message.id}>
                        <TableCell>
                          <p className="font-medium">{message.customer}</p>
                          <p className="text-xs text-muted-foreground">{message.phone}</p>
                        </TableCell>
                        <TableCell>{message.kind}</TableCell>
                        <TableCell>
                          {new Date(message.sentAt || '').toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{message.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
