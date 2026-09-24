'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Shop } from '@/lib/types';

type ShopRow = Shop & { id: string };
type WhatsAppStatus = {
  configured: boolean;
  phoneNumberId?: string;
  displayPhone?: string;
  verifiedName?: string;
  orderTemplate?: string;
  statusTemplate?: string;
  language?: string;
};

export default function MyShopRoute({ initialShop }: { initialShop?: ShopRow }) {
  const [shop, setShop] = useState<ShopRow | undefined>(initialShop);
  const [tab, setTab] = useState('Perfil');
  const tabs = ['Perfil', 'Horários', 'Equipe', 'Fiscal', 'Documentos'];
  const saveShop = async (data: Shop, id = 'shop-main') => {
    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'shop', data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Shop };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a assistência.');
      setShop({ id: result.record.id, ...result.record.data });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a assistência.');
      throw error;
    }
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Minha assistência</h1>
          <small>Perfil e conexão do WhatsApp carregados no servidor.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <div className="shop-v2">
        <div className="shop-cover">
          <div className="shop-avatar">RS</div>
          <div>
            <span>MINHA ASSISTÊNCIA</span>
            <h2>{shop?.name || 'Configure sua empresa'}</h2>
            <p>{shop?.phone || 'Adicione os dados que aparecerão nos documentos e links.'}</p>
          </div>
          <Badge>{shop?.name ? 'Perfil completo' : 'Configuração pendente'}</Badge>
        </div>
        <div className="shop-tabs">
          {tabs.map((item) => (
            <button
              className={tab === item ? 'active' : ''}
              type="button"
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <form
          className="panel shop-edit"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void saveShop(
              { ...shop, ...Object.fromEntries(form) } as Shop,
              shop?.id || 'shop-main',
            );
          }}
        >
          {tab === 'Perfil' && (
            <>
              <div className="form-heading">
                <h3>Identidade e contato</h3>
                <p>Dados exibidos na vitrine, ordens, orçamentos e comprovantes.</p>
              </div>
              <label>
                Nome comercial *<input name="name" required defaultValue={shop?.name || ''} />
              </label>
              <div className="form-row">
                <label>
                  Razão social
                  <input name="legalName" defaultValue={shop?.legalName || ''} />
                </label>
                <label>
                  CPF / CNPJ
                  <input name="document" defaultValue={shop?.document || ''} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  WhatsApp *<input name="phone" required defaultValue={shop?.phone || ''} />
                </label>
                <label>
                  E-mail
                  <input name="email" type="email" defaultValue={shop?.email || ''} />
                </label>
              </div>
              <label>
                Endereço completo
                <input name="address" defaultValue={shop?.address || ''} />
              </label>
              <div className="form-row">
                <label>
                  Instagram
                  <input name="instagram" defaultValue={shop?.instagram || ''} />
                </label>
                <label>
                  Site
                  <input name="website" defaultValue={shop?.website || ''} />
                </label>
              </div>
            </>
          )}
          {tab === 'Horários' && (
            <>
              <div className="form-heading">
                <h3>Atendimento e prazos</h3>
                <p>Defina quando sua loja funciona e os padrões de entrega.</p>
              </div>
              <label>
                Horário de funcionamento
                <input
                  name="hours"
                  defaultValue={shop?.hours || ''}
                  placeholder="Seg a Sáb · 08h às 18h"
                />
              </label>
              <div className="form-row">
                <label>
                  Prazo padrão de diagnóstico
                  <input name="diagnosisTime" defaultValue={shop?.diagnosisTime || '24 horas'} />
                </label>
                <label>
                  Garantia padrão
                  <select name="warranty" defaultValue={shop?.warranty || '90 dias'}>
                    <option>30 dias</option>
                    <option>90 dias</option>
                    <option>180 dias</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {tab === 'Equipe' && (
            <>
              <div className="form-heading">
                <h3>Equipe técnica</h3>
                <p>Configure responsáveis e contatos internos.</p>
              </div>
              <label>
                Técnico principal
                <input name="technician" defaultValue={shop?.technician || ''} />
              </label>
              <label>
                Responsável financeiro
                <input name="financial" defaultValue={shop?.financial || ''} />
              </label>
              <label>
                Contato interno
                <input name="internalPhone" defaultValue={shop?.internalPhone || ''} />
              </label>
            </>
          )}
          {tab === 'Fiscal' && (
            <>
              <div className="form-heading">
                <h3>Dados fiscais</h3>
                <p>Informações para notas e comprovantes.</p>
              </div>
              <div className="form-row">
                <label>
                  Inscrição estadual
                  <input name="stateRegistration" defaultValue={shop?.stateRegistration || ''} />
                </label>
                <label>
                  Inscrição municipal
                  <input name="cityRegistration" defaultValue={shop?.cityRegistration || ''} />
                </label>
              </div>
              <label>
                Regime tributário
                <select name="taxRegime" defaultValue={shop?.taxRegime || 'MEI'}>
                  <option>MEI</option>
                  <option>Simples Nacional</option>
                  <option>Lucro Presumido</option>
                </select>
              </label>
            </>
          )}
          {tab === 'Documentos' && (
            <>
              <div className="form-heading">
                <h3>Textos dos documentos</h3>
                <p>Personalize garantia, rodapé e avaliações.</p>
              </div>
              <label>
                Termos de garantia
                <textarea name="terms" defaultValue={shop?.terms || ''} />
              </label>
              <label>
                Rodapé dos comprovantes
                <textarea name="footer" defaultValue={shop?.footer || ''} />
              </label>
              <label>
                Link para avaliação no Google
                <input name="google" defaultValue={shop?.google || ''} />
              </label>
            </>
          )}
          <div className="modal-actions">
            <button className="primary">Salvar alterações</button>
          </div>
        </form>
      </div>
      <WhatsAppConnection />
    </>
  );
}

function WhatsAppConnection() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const refresh = () =>
    fetch('/api/whatsapp')
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  useEffect(() => {
    void refresh();
  }, []);
  const saveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          token: form.get('token'),
          phoneNumberId: form.get('phoneNumberId'),
          wabaId: form.get('wabaId'),
          orderTemplate: form.get('orderTemplate'),
          statusTemplate: form.get('statusTemplate'),
          language: form.get('language'),
          version: 'v25.0',
        }),
      });
      const result = (await response.json()) as WhatsAppStatus & { error?: string };
      if (!response.ok) {
        setError(result.error || 'Não foi possível conectar.');
        return;
      }
      setStatus(result);
      setEditing(false);
      setNotice('Número validado e conectado com segurança.');
    } catch {
      setError('Não foi possível conectar.');
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', to: testPhone }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || 'Falha no teste.');
        return;
      }
      setNotice('Mensagem aceita pela Meta. Confira o WhatsApp do destinatário.');
    } catch {
      setError('Falha no teste.');
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp desta loja?')) return;
    try {
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (!response.ok) throw new Error();
      setStatus({ configured: false });
      setNotice('WhatsApp desconectado.');
    } catch {
      setError('Não foi possível desconectar.');
    }
  };
  return (
    <article className="panel whatsapp-status whatsapp-connect">
      <div className={status?.configured ? 'wa-connected' : 'wa-offline'}>WA</div>
      <div>
        <span>WHATSAPP BUSINESS · CONEXÃO POR LOJA</span>
        <h3>
          {!status
            ? 'Verificando configuração...'
            : status.configured
              ? `${status.verifiedName || 'Número comercial'} conectado`
              : 'Conecte o número desta assistência'}
        </h3>
        <p>
          {status?.configured
            ? `${status.displayPhone || status.phoneNumberId} · mensagens automáticas liberadas para OS autorizadas.`
            : 'Use o token permanente e os identificadores exibidos no painel da Meta. Cada lojista conecta apenas o próprio número.'}
        </p>
        {notice && <p className="wa-success">✓ {notice}</p>}
        {error && <p className="login-error">{error}</p>}
        {status?.configured && !editing ? (
          <>
            <small>
              Nova OS: {status.orderTemplate} · Atualização: {status.statusTemplate} · Idioma:{' '}
              {status.language}
            </small>
            <div className="wa-test">
              <input
                value={testPhone}
                onChange={(event) => setTestPhone(event.target.value)}
                placeholder="WhatsApp para teste com DDD"
              />
              <button type="button" disabled={busy || !testPhone} onClick={() => void test()}>
                {busy ? 'Enviando...' : 'Enviar teste'}
              </button>
            </div>
            <div className="wa-actions">
              <button type="button" onClick={() => setEditing(true)}>
                Atualizar configuração
              </button>
              <button type="button" className="danger" onClick={() => void disconnect()}>
                Desconectar
              </button>
            </div>
          </>
        ) : (
          <form className="wa-config" onSubmit={saveConfig}>
            <label>
              Token permanente da Meta
              <input
                name="token"
                type="password"
                required={!status?.configured}
                autoComplete="off"
                placeholder={
                  status?.configured ? 'Deixe vazio para manter o atual' : 'Cole o token permanente'
                }
              />
            </label>
            <div className="form-row">
              <label>
                ID do número de telefone
                <input
                  name="phoneNumberId"
                  required
                  placeholder={status?.phoneNumberId || 'Ex.: 1355087011013166'}
                />
              </label>
              <label>
                ID da conta WhatsApp Business
                <input name="wabaId" placeholder="WABA ID" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Modelo para nova OS
                <input
                  name="orderTemplate"
                  required
                  defaultValue={status?.orderTemplate || 'reparosm_nova_os'}
                />
              </label>
              <label>
                Modelo para atualização
                <input
                  name="statusTemplate"
                  required
                  defaultValue={status?.statusTemplate || 'reparosm_status_os'}
                />
              </label>
            </div>
            <label>
              Idioma do modelo
              <select name="language" defaultValue={status?.language || 'pt_BR'}>
                <option value="pt_BR">Português (Brasil)</option>
                <option value="en_US">Inglês (EUA)</option>
              </select>
            </label>
            <small>
              Os dois modelos precisam estar aprovados na Meta e possuir quatro variáveis: cliente,
              código da OS, aparelho e etapa.
            </small>
            <div className="wa-actions">
              {status?.configured && (
                <button type="button" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Validando com a Meta...' : 'Validar e conectar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="badge">{children}</span>;
}
