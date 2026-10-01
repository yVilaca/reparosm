'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
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

const tabs = ['Perfil', 'Horários', 'Equipe', 'Fiscal', 'Documentos'];

export default function MyShopRoute({ initialShop }: { initialShop?: ShopRow }) {
  const { notify } = useFeedback();
  const [shop, setShop] = useState<ShopRow | undefined>(initialShop);
  const [tab, setTab] = useState('Perfil');
  const [warranty, setWarranty] = useState(shop?.warranty || '90 dias');
  const [taxRegime, setTaxRegime] = useState(shop?.taxRegime || 'MEI');
  const saveShop = async (data: Shop, id = 'shop-main') => {
    try {
      const response = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Shop };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a assistência.');
      setShop({ id: result.record.id, ...result.record.data });
      notify('Dados da assistência salvos.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a assistência.',
        'error',
      );
      throw error;
    }
  };
  return (
    <>
      <PageHeader
        title="Minha assistência"
        description="Perfil e conexão do WhatsApp carregados no servidor."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            RS
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Minha assistência
            </p>
            <h2 className="text-lg font-semibold">{shop?.name || 'Configure sua empresa'}</h2>
            <p className="text-sm text-muted-foreground">
              {shop?.phone || 'Adicione os dados que aparecerão nos documentos e links.'}
            </p>
          </div>
          <Badge variant={shop?.name ? 'success' : 'outline'}>
            {shop?.name ? 'Perfil completo' : 'Configuração pendente'}
          </Badge>
        </CardContent>
      </Card>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item}
            onClick={() => setTab(item)}
            size="sm"
            variant={tab === item ? 'default' : 'outline'}
          >
            {item}
          </Button>
        ))}
      </div>
      <Card className="mb-4">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void saveShop(
              { ...shop, ...Object.fromEntries(form), warranty, taxRegime } as Shop,
              shop?.id || 'shop-main',
            );
          }}
        >
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Perfil'}
            hidden={tab !== 'Perfil'}
          >
            <>
              <div>
                <h3 className="font-semibold">Identidade e contato</h3>
                <p className="text-sm text-muted-foreground">
                  Dados exibidos na vitrine, ordens, orçamentos e comprovantes.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-name">Nome comercial *</Label>
                <Input defaultValue={shop?.name || ''} id="shop-name" name="name" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-legal-name">Razão social</Label>
                  <Input
                    defaultValue={shop?.legalName || ''}
                    id="shop-legal-name"
                    name="legalName"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-document">CPF / CNPJ</Label>
                  <Input defaultValue={shop?.document || ''} id="shop-document" name="document" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-phone">WhatsApp *</Label>
                  <Input defaultValue={shop?.phone || ''} id="shop-phone" name="phone" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-email">E-mail</Label>
                  <Input
                    defaultValue={shop?.email || ''}
                    id="shop-email"
                    name="email"
                    type="email"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-address">Endereço completo</Label>
                <Input defaultValue={shop?.address || ''} id="shop-address" name="address" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-instagram">Instagram</Label>
                  <Input
                    defaultValue={shop?.instagram || ''}
                    id="shop-instagram"
                    name="instagram"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-website">Site</Label>
                  <Input defaultValue={shop?.website || ''} id="shop-website" name="website" />
                </div>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Horários'}
            hidden={tab !== 'Horários'}
          >
            <>
              <div>
                <h3 className="font-semibold">Atendimento e prazos</h3>
                <p className="text-sm text-muted-foreground">
                  Defina quando sua loja funciona e os padrões de entrega.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-hours">Horário de funcionamento</Label>
                <Input
                  defaultValue={shop?.hours || ''}
                  id="shop-hours"
                  name="hours"
                  placeholder="Seg a Sáb · 08h às 18h"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-diagnosis-time">Prazo padrão de diagnóstico</Label>
                  <Input
                    defaultValue={shop?.diagnosisTime || '24 horas'}
                    id="shop-diagnosis-time"
                    name="diagnosisTime"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-warranty">Garantia padrão</Label>
                  <Select onValueChange={setWarranty} value={warranty}>
                    <SelectTrigger className="w-full" id="shop-warranty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30 dias">30 dias</SelectItem>
                      <SelectItem value="90 dias">90 dias</SelectItem>
                      <SelectItem value="180 dias">180 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Equipe'}
            hidden={tab !== 'Equipe'}
          >
            <>
              <div>
                <h3 className="font-semibold">Equipe técnica</h3>
                <p className="text-sm text-muted-foreground">
                  Configure responsáveis e contatos internos.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-technician">Técnico principal</Label>
                <Input
                  defaultValue={shop?.technician || ''}
                  id="shop-technician"
                  name="technician"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-financial">Responsável financeiro</Label>
                <Input defaultValue={shop?.financial || ''} id="shop-financial" name="financial" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-internal-phone">Contato interno</Label>
                <Input
                  defaultValue={shop?.internalPhone || ''}
                  id="shop-internal-phone"
                  name="internalPhone"
                />
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Fiscal'}
            hidden={tab !== 'Fiscal'}
          >
            <>
              <div>
                <h3 className="font-semibold">Dados fiscais</h3>
                <p className="text-sm text-muted-foreground">
                  Informações para notas e comprovantes.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-state-registration">Inscrição estadual</Label>
                  <Input
                    defaultValue={shop?.stateRegistration || ''}
                    id="shop-state-registration"
                    name="stateRegistration"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-city-registration">Inscrição municipal</Label>
                  <Input
                    defaultValue={shop?.cityRegistration || ''}
                    id="shop-city-registration"
                    name="cityRegistration"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="shop-tax-regime">Regime tributário</Label>
                <Select onValueChange={setTaxRegime} value={taxRegime}>
                  <SelectTrigger className="w-full" id="shop-tax-regime">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEI">MEI</SelectItem>
                    <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                    <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Documentos'}
            hidden={tab !== 'Documentos'}
          >
            <>
              <div>
                <h3 className="font-semibold">Textos dos documentos</h3>
                <p className="text-sm text-muted-foreground">
                  Personalize garantia, rodapé e avaliações.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-terms">Termos de garantia</Label>
                <Textarea defaultValue={shop?.terms || ''} id="shop-terms" name="terms" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-footer">Rodapé dos comprovantes</Label>
                <Textarea defaultValue={shop?.footer || ''} id="shop-footer" name="footer" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-google">Link para avaliação no Google</Label>
                <Input defaultValue={shop?.google || ''} id="shop-google" name="google" />
              </div>
            </>
          </fieldset>
          <div className="flex justify-end border-t pt-4">
            <Button type="submit">Salvar alterações</Button>
          </div>
        </form>
      </Card>
      <WhatsAppConnection />
    </>
  );
}

function WhatsAppConnection() {
  const { confirm } = useFeedback();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const refresh = () =>
    fetch('/api/whatsapp')
      .then((response) => response.json())
      .then((data: WhatsAppStatus) => {
        setStatus(data);
        setLanguage(data.language || 'pt_BR');
      })
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
          language,
          version: 'v25.0',
        }),
      });
      const result = (await response.json()) as WhatsAppStatus & { error?: string };
      if (!response.ok) {
        setError(result.error || 'Não foi possível conectar.');
        return;
      }
      setStatus(result);
      setLanguage(result.language || 'pt_BR');
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
    if (!(await confirm('Desconectar o WhatsApp desta loja?'))) return;
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
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={
              status?.configured
                ? 'flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300'
                : 'flex size-12 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground'
            }
          >
            WA
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              WhatsApp Business · conexão por loja
            </p>
            <h3 className="font-semibold">
              {!status
                ? 'Verificando configuração...'
                : status.configured
                  ? `${status.verifiedName || 'Número comercial'} conectado`
                  : 'Conecte o número desta assistência'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {status?.configured
                ? `${status.displayPhone || status.phoneNumberId} · mensagens automáticas liberadas para OS autorizadas.`
                : 'Use o token permanente e os identificadores exibidos no painel da Meta. Cada lojista conecta apenas o próprio número.'}
            </p>
          </div>
        </div>
        {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ {notice}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {status?.configured && !editing ? (
          <>
            <p className="text-xs text-muted-foreground">
              Nova OS: {status.orderTemplate} · Atualização: {status.statusTemplate} · Idioma:{' '}
              {status.language}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                onChange={(event) => setTestPhone(event.target.value)}
                placeholder="WhatsApp para teste com DDD"
                value={testPhone}
              />
              <Button disabled={busy || !testPhone} onClick={() => void test()} variant="outline">
                {busy ? 'Enviando...' : 'Enviar teste'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={() => setEditing(true)} variant="outline">
                Atualizar configuração
              </Button>
              <Button onClick={() => void disconnect()} variant="destructive">
                Desconectar
              </Button>
            </div>
          </>
        ) : (
          <form className="grid gap-4" onSubmit={saveConfig}>
            <div className="grid gap-2">
              <Label htmlFor="wa-token">Token permanente da Meta</Label>
              <Input
                autoComplete="off"
                id="wa-token"
                name="token"
                placeholder={
                  status?.configured ? 'Deixe vazio para manter o atual' : 'Cole o token permanente'
                }
                required={!status?.configured}
                type="password"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="wa-phone-number-id">ID do número de telefone</Label>
                <Input
                  id="wa-phone-number-id"
                  name="phoneNumberId"
                  placeholder={status?.phoneNumberId || 'Ex.: 1355087011013166'}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wa-waba-id">ID da conta WhatsApp Business</Label>
                <Input id="wa-waba-id" name="wabaId" placeholder="WABA ID" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="wa-order-template">Modelo para nova OS</Label>
                <Input
                  defaultValue={status?.orderTemplate || 'reparosm_nova_os'}
                  id="wa-order-template"
                  name="orderTemplate"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wa-status-template">Modelo para atualização</Label>
                <Input
                  defaultValue={status?.statusTemplate || 'reparosm_status_os'}
                  id="wa-status-template"
                  name="statusTemplate"
                  required
                />
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="wa-language">Idioma do modelo</Label>
              <Select onValueChange={setLanguage} value={language}>
                <SelectTrigger className="w-full" id="wa-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">Inglês (EUA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Os dois modelos precisam estar aprovados na Meta e possuir quatro variáveis: cliente,
              código da OS, aparelho e etapa.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {status?.configured && (
                <Button onClick={() => setEditing(false)} type="button" variant="outline">
                  Cancelar
                </Button>
              )}
              <Button disabled={busy} type="submit">
                {busy ? 'Validando com a Meta...' : 'Validar e conectar'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
