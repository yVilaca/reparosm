'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
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
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Pós-venda</h1>
          <small>Mensagens e automações carregadas no servidor para a conta atual.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <article className="after-hero">
        <div>
          <span>✉</span>
          <div>
            <h2>Central do WhatsApp</h2>
            <p>Prepare, envie e acompanhe mensagens para seus clientes.</p>
          </div>
        </div>
        <div>
          <b>{messages.length}</b>
          <small>contatos registrados</small>
        </div>
      </article>
      <section className="whatsapp-compose panel">
        <div className="wa-title">
          <span>WA</span>
          <div>
            <h3>Nova mensagem</h3>
            <p>A mensagem abre pronta no WhatsApp para você confirmar o envio.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Cliente ou ordem
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">Selecione...</option>
              {contacts.map((contact) => (
                <option value={contact.id} key={contact.id}>
                  {contact.name} · {contact.device}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modelo de mensagem
            <select
              value={template}
              onChange={(event) => {
                setTemplate(event.target.value);
                setCustom('');
              }}
            >
              {templates.map((item) => (
                <option key={item[0]}>{item[0]}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Mensagem
          <textarea value={custom || text} onChange={(event) => setCustom(event.target.value)} />
        </label>
        <div className="wa-preview">
          <div>
            <b>{selected?.name || 'Escolha um contato'}</b>
            <small>{selected?.phone || 'O número aparecerá aqui'}</small>
          </div>
          <button className="whatsapp-btn" type="button" onClick={send}>
            Abrir no WhatsApp →
          </button>
        </div>
      </section>
      <h2 className="section-title">Automações preparadas</h2>
      <div className="automation-grid">
        {templates.map((item) => (
          <article className="panel" key={item[0]}>
            <header>
              <i>✉</i>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!existing(item[0])?.enabled}
                  onChange={() => toggle(item)}
                />
                <span />
              </label>
            </header>
            <small>{item[1]}</small>
            <h3>{item[0]}</h3>
            <p>{item[2]}</p>
            <footer>
              <span>{existing(item[0])?.enabled ? 'Ativa para a API' : 'Ativar lembrete'}</span>
            </footer>
          </article>
        ))}
      </div>
      {messages.length > 0 && (
        <article className="panel page-panel wa-history">
          <h2>Histórico de mensagens</h2>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {messages
                .slice()
                .reverse()
                .slice(0, 10)
                .map((message) => (
                  <tr key={message.id}>
                    <td>
                      <b>{message.customer}</b>
                      <small>{message.phone}</small>
                    </td>
                    <td>{message.kind}</td>
                    <td>{new Date(message.sentAt || '').toLocaleString('pt-BR')}</td>
                    <td>
                      <span className="badge">{message.status}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}
