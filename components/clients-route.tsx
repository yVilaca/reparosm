'use client';

import Link from 'next/link';
import { useState } from 'react';
import ClientModal, { type ClientRow, type SaveClient } from '@/components/client-modal';
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Client } from '@/lib/types';

const statuses = ['Novo', 'Em atendimento', 'Aguardando', 'Concluído', 'Inativo'] as const;

export default function ClientsRoute({ initialClients }: { initialClients: ClientRow[] }) {
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const save: SaveClient = async (data: Client, id?: string) => {
    try {
      // ponytail: reuse the validated state endpoint until resource routes migrate one module at a time.
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'client', data, id }),
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
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o cliente.');
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
    if (!confirm(`Excluir definitivamente o cliente ${client.name}?`)) return;
    try {
      const response = await fetch(`/api/state?id=${encodeURIComponent(client.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o cliente.');
      setClients((current) => current.filter((item) => item.id !== client.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir o cliente.');
    }
  };
  const change = (client: ClientRow, status: Client['status']) => {
    void save({ ...client, status }, client.id).catch(() => undefined);
  };
  const chat = (client: ClientRow) => {
    const message = `Olá, ${client.name}! Aqui é da ReparoSM. Como podemos ajudar?`;
    if (!hasValidWhatsapp(client.phone)) {
      alert('Cadastre um WhatsApp válido para este cliente.');
      return;
    }
    window.open(whatsappUrl(client.phone, message), '_blank', 'noopener,noreferrer');
    void fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
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
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Clientes</h1>
          <small>Clientes carregados no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
          <button className="primary" type="button" onClick={create}>
            + Novo cliente
          </button>
        </div>
      </header>
      <div className="metrics">
        <Metric title="Clientes" value={String(clients.length)} detail="Cadastrados diretamente" />
        <Metric
          title="Em atendimento"
          value={String(clients.filter((client) => client.status === 'Em atendimento').length)}
          detail="Com acompanhamento"
        />
        <Metric
          title="Concluídos"
          value={String(clients.filter((client) => client.status === 'Concluído').length)}
          detail="Atendimentos finalizados"
        />
        <Metric
          title="VIP"
          value={String(clients.filter((client) => client.vip).length)}
          detail="Clientes prioritários"
        />
      </div>
      {clients.length ? (
        <article className="panel page-panel clients-page">
          <div className="toolbar">
            <label>
              ⌕
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente por nome ou telefone..."
              />
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Observações</th>
                  <th>Mensagem</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <b>{client.name}</b>
                      {client.vip && <small className="vip"> VIP</small>}
                    </td>
                    <td>
                      {client.phone}
                      <small>{client.email}</small>
                    </td>
                    <td>{client.document || '—'}</td>
                    <td>
                      <select
                        className="status-select"
                        value={client.status || 'Novo'}
                        onChange={(event) => change(client, event.target.value as Client['status'])}
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td>{client.notes || '—'}</td>
                    <td>
                      <button
                        className="whatsapp-btn small"
                        type="button"
                        onClick={() => chat(client)}
                      >
                        Conversar
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => edit(client)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(client)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>Nenhum cliente cadastrado</h2>
          <p>Você pode cadastrar clientes mesmo sem criar uma ordem de serviço.</p>
          <button className="primary" type="button" onClick={create}>
            Cadastrar cliente
          </button>
        </article>
      )}
      {modal === 'create' && <ClientModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <ClientModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
