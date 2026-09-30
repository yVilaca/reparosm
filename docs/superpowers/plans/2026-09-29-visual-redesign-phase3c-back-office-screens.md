# Redesenho visual — Fase 3c: Minha Assistência, Dados, Contas, Assistente e Suporte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as 5 telas de back-office restantes — Minha assistência,
Dados e exportação, Contas de lojistas, Assistente e Tutoriais & suporte —
do CSS legado para os primitivos shadcn já estabelecidos nas Fases 1-3b,
sem alterar nenhuma regra de negócio. Isso fecha a Fase 3 por completo:
depois desta fase só resta a Fase 4 (área pública: vitrine, orçamento
público, impressão de OS).

**Escopo excluído — Relatório (`/relatorio`):** `report-route.tsx` fica de
fora desta fase. `app/relatorio/page.tsx` vive fora do grupo de rotas
`(painel)` (sem sidebar, sem tema) e o componente chama `window.print()` —
é uma folha de impressão, não uma tela do painel. As Fases 1-3b já
preservaram deliberadamente as classes legadas `.print-order-*` pelo mesmo
motivo (ver Task 7 da Fase 3a e Task 5 da Fase 3b). `.report-*` segue a
mesma lógica e não deve ser tocado nesta fase.

**Architecture:** Mesmo padrão já usado em `clients-route.tsx` e nas telas
das Fases 3a/3b: `PageHeader`, grade de `Card size="sm"` para métricas,
`Card` + `Table`/`TableRow` (com cards mobile via `md:hidden` /
`hidden md:block`) para listagens, `Badge` com uma função `xxxVariant` por
tipo de status, `Dialog`/`Input`/`Label`/`Select`/`Textarea` nos modais e
formulários. `Minha assistência` reaproveita o padrão de abas em `Button`
já usado em Películas (Fase 3b) para "Perfil/Horários/Equipe/Fiscal/
Documentos". Nenhuma mudança de estado, fetch ou validação — só JSX e
classes, respeitando a ressalva sobre `Select` descrita abaixo.

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind v4, shadcn/ui (já
instalado).

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md`
(Fase 3, subconjunto: minha assistência, dados, contas, assistente,
suporte).

## Pré-requisitos locais

- Configure `DATABASE_URL` para um PostgreSQL local isolado antes de executar
  `pnpm test`. Sem essa variável, os testes que usam banco são ignorados. O
  usuário local do banco precisa poder criar/remover bancos temporários
  `reparosm_test_*` e criar/conceder a role `reparosm_runtime` quando necessário
  (permissões `CREATEDB` e `CREATEROLE`, ou superusuário).
- Para `pnpm dev` e a checagem manual das telas, configure `DATABASE_URL` ou
  `NETLIFY_DB_URL` apontando para o mesmo banco que `.env` já usa (não para
  o banco usado por `pnpm test`, que é outro) — um `DATABASE_URL` diferente
  do de `.env` faz o servidor não achar as contas/tabelas seedadas e o
  login falha com "relation ... does not exist". Configure também um
  `ADMIN_PASSWORD_HASH` local válido e uma base local populada. `/contas`
  só é visível para a conta com `role = 'admin'` — para a checagem manual
  da Task 3, entre com essa conta. Não inclua valores de credenciais neste
  plano.

## Global Constraints

- Nenhuma prop, tipo exportado ou lógica de `fetch`/validação muda — só a
  árvore JSX retornada por cada componente.
- Reaproveitar exatamente os padrões já em `components/clients-route.tsx`
  e nos arquivos das Fases 3a/3b (grade de métricas em `Card size="sm"`,
  `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`,
  `Badge variant={...}`, cards mobile + tabela desktop, abas em `Button
  variant={ativo ? 'default' : 'outline'}`, seletor de arquivo como
  `Button asChild` envolvendo um `<label>` com `<input type="file"
  className="sr-only">`) — não inventar um padrão novo.
- **Armadilha recorrente nesta fase — `Select` do shadcn não participa de
  `FormData`:** os componentes originais usam formulários não controlados
  (leem tudo via `new FormData(event.currentTarget)` no `submit`), com
  `<select name="...">` nativo. Um `<select>` nativo aparece em
  `FormData` automaticamente; o `Select` do Radix/shadcn (usado em todo o
  projeto desde a Fase 1) **não é um elemento de formulário nativo e não
  aparece em `FormData`**, mesmo com uma prop `name`. Todo campo que hoje
  é um `<select>` dentro de um desses formulários não controlados precisa
  virar um `useState` próprio + `onValueChange`, e esse estado precisa ser
  incluído manualmente no payload enviado (nunca via `form.get(...)`).
  Isso afeta: o campo "Plano" do `AccountModal` (Task 3), o campo
  "Categoria" do `TutorialModal` (Task 5), e os campos "Garantia padrão" /
  "Regime tributário" / "Idioma do modelo" de `my-shop-route.tsx` (Task 1).
  O campo "Tipo de registro" de `data-tools-route.tsx` (Task 2) já é
  controlado fora de um formulário — não tem esse problema.
- Depois de cada task, execute `pnpm format:check`, `pnpm lint` e
  `pnpm typecheck`; faça as verificações manuais descritas na própria task.
- Execute `pnpm test` e `pnpm build` uma vez, na suíte completa da Task 6.
  Nenhum destes 5 arquivos tem teste automatizado dedicado hoje — a suíte
  completa existente não deve regredir.
- `pnpm exec graft build && pnpm exec graft check` ao final da fase.

## Review Focus

- Em `my-shop-route.tsx`, o `<form onSubmit>` único monta o payload como
  `{ ...shop, ...Object.fromEntries(form), warranty, taxRegime }` — só os
  campos da aba ativa existem no DOM no momento do submit (as outras 4
  abas ficam com `{tab === 'X' && (...)}` fechado). Reescrever isso como
  um único bloco sempre visível (só escondido por CSS) mudaria o que é
  enviado a cada salvamento — os campos ocultos por CSS ainda existem no
  DOM e entrariam no `FormData`.
- Em Contas, as ações "Suspender/Ativar", "Cancelar" e "Excluir" só
  aparecem quando `account.role !== 'admin'` — ao migrar a tabela para
  `Table`/cartão mobile, essa condicional precisa continuar envolvendo o
  grupo de botões nos dois formatos, para a própria conta administradora
  nunca ganhar um botão de autoexclusão.
- Em Suporte, `youtube(tutorial.url)` decide entre renderizar o `<iframe>`
  do YouTube ou o placeholder `▶` — um tutorial com link que não bate com
  o regex (ex.: um link de outro site) precisa continuar caindo no
  placeholder, não quebrar a página nem tentar montar um `<iframe src>`
  vazio.
- Em Assistente, os chips de sugestão (`Como está meu estoque?` etc.) só
  preenchem o campo de mensagem (`setInput(suggestion)`) — eles não devem
  chamar `send()` diretamente; só Enter no campo ou o botão de enviar
  disparam o envio.
- Em Dados, o CSV exportado inclui o BOM `'﻿'` e usa `;` como
  separador (necessário para abrir corretamente no Excel em pt-BR); a
  reestilização do botão "Baixar CSV" não deve tocar em `csv()` nem
  `importCsv()` — só no JSX ao redor.

---

### Task 1: Restilizar `components/my-shop-route.tsx`

**Files:**

- Modify: `components/my-shop-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Badge`, `Card`/`CardContent`, `Input`, `Label`,
  `Select`/..., `Textarea`, `Button` (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `MyShopRoute({ initialShop? })`
  continua igual; `WhatsAppConnection` continua um componente interno não
  exportado.

- [ ] **Step 1: Reescrever o componente**

```tsx
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
          {tab === 'Perfil' && (
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
          )}
          {tab === 'Horários' && (
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
          )}
          {tab === 'Equipe' && (
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
                <Input
                  defaultValue={shop?.financial || ''}
                  id="shop-financial"
                  name="financial"
                />
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
          )}
          {tab === 'Fiscal' && (
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
          )}
          {tab === 'Documentos' && (
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
          )}
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
                  status?.configured
                    ? 'Deixe vazio para manter o atual'
                    : 'Cole o token permanente'
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
              Os dois modelos precisam estar aprovados na Meta e possuir quatro variáveis:
              cliente, código da OS, aparelho e etapa.
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
```

Note: `warranty`, `taxRegime` e `language` são estado controlado (não vêm
de `FormData`) pelo motivo descrito nos Global Constraints — o `Select` do
shadcn não é um campo de formulário nativo. `saveShop`/`saveConfig`
continuam recebendo esses valores explicitamente no payload.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/minha-assistencia` nos dois temas e em
mobile/desktop. Confirme: trocar de aba mantém os dados já digitados nas
outras abas (edite um campo em Perfil, troque para Horários, volte para
Perfil e confirme que o texto ainda está lá — o estado vem do próprio
`shop`, não é perdido), salvar em qualquer aba mantém os valores das
demais (edite "Garantia padrão" e salve; depois edite "Nome comercial" e
salve — confirme que a garantia continua "180 dias" e não voltou ao
padrão), e o card do WhatsApp mostra status/edição/teste/desconexão
corretamente.

- [ ] **Step 4: Commit**

```bash
git add components/my-shop-route.tsx
git commit -m "refactor: restyle my-shop route with shadcn"
```

---

### Task 2: Restilizar `components/data-tools-route.tsx`

**Files:**

- Modify: `components/data-tools-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Button`, `Card`/`CardContent`/`CardHeader`/
  `CardTitle`, `Label`, `Select`/... (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `DataToolsRoute({ records })`
  continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BusinessRecordType, DataObject, StoredRecord } from '@/lib/types';

const labels: Partial<Record<BusinessRecordType, string>> = {
  client: 'Clientes',
  order: 'Ordens de serviço',
  payment: 'Recebimentos',
  expense: 'Despesas',
  part: 'Estoque',
  quote: 'Orçamentos',
  film: 'Películas',
};

const resources: Record<BusinessRecordType, string> = {
  client: 'clients',
  order: 'orders',
  payment: 'payments',
  expense: 'expenses',
  part: 'parts',
  quote: 'quotes',
  film: 'films',
  shop: 'shops',
  automation: 'automations',
  message: 'messages',
  tutorial: 'tutorials',
};

const parseCsv = (line: string) =>
  line
    .split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.replace(/^"|"$/g, '').replaceAll('""', '"'));

export default function DataToolsRoute({ records }: { records: StoredRecord[] }) {
  const { notify } = useFeedback();
  const [type, setType] = useState<BusinessRecordType>('client');
  const save = async (recordType: BusinessRecordType, data: DataObject) => {
    const response = await fetch(`/api/${resources[recordType]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar o registro.');
  };
  const csv = (kind: BusinessRecordType) => {
    const rows = records
      .filter((record) => record.type === kind)
      .map((record) => ({ id: record.id, ...record.data }) as DataObject & { id: string });
    if (!rows.length) {
      notify(`Não há ${(labels[kind] || 'registros').toLowerCase()} para exportar.`, 'info');
      return;
    }
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const escape = (value: unknown) =>
      `"${String(Array.isArray(value) ? value.join(' | ') : (value ?? '')).replaceAll('"', '""')}"`;
    const content =
      '﻿' +
      [keys.join(';'), ...rows.map((row) => keys.map((key) => escape(row[key])).join(';'))].join(
        '\n',
      );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = `reparosm-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const lines = String(reader.result || '')
          .replace(/^﻿/, '')
          .split(/\r?\n/)
          .filter(Boolean);
        if (!lines.length) throw new Error('O arquivo CSV está vazio.');
        const headers = parseCsv(lines[0]);
        for (const line of lines.slice(1)) {
          const values = parseCsv(line);
          const data: DataObject = {};
          headers.forEach((header, index) => {
            if (header !== 'id') data[header] = values[index] || '';
          });
          await save(type, data);
        }
        notify(`${Math.max(0, lines.length - 1)} registros importados.`, 'success');
      } catch (error) {
        notify(
          error instanceof Error ? error.message : 'Não foi possível importar o CSV.',
          'error',
        );
      }
    };
    reader.onerror = () => notify('Não foi possível ler o arquivo CSV.', 'error');
    reader.readAsText(file, 'utf-8');
  };
  return (
    <>
      <PageHeader
        title="Dados & exportação"
        description="Exporte, importe e preserve os dados da assistência."
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
              Central de dados
            </p>
            <h2 className="text-lg font-semibold">Exportar, importar e gerar relatórios</h2>
            <p className="text-sm opacity-90">
              Exporte cópias, importe planilhas CSV e gere o relatório completo da loja.
            </p>
          </div>
          <Button onClick={() => window.open('/relatorio', '_blank')} size="sm" variant="secondary">
            Gerar relatório PDF ↗
          </Button>
        </CardContent>
      </Card>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(labels).map(([kind, label]) => (
          <Card key={kind}>
            <CardContent className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">ARQUIVO CSV</span>
              <h3 className="font-semibold">{String(label)}</h3>
              <p className="text-sm text-muted-foreground">
                {records.filter((record) => record.type === kind).length} registros disponíveis
              </p>
              <Button onClick={() => csv(kind as BusinessRecordType)} size="sm" variant="outline">
                Baixar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Importar arquivo CSV</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use ponto e vírgula como separador. A primeira linha deve conter os nomes dos campos.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="data-tools-type">Tipo de registro</Label>
            <Select onValueChange={(value) => setType(value as BusinessRecordType)} value={type}>
              <SelectTrigger className="w-full" id="data-tools-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(labels).map(([kind, label]) => (
                  <SelectItem key={kind} value={kind}>
                    {String(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="data-tools-file">Selecionar CSV</Label>
            <Button asChild className="w-fit" variant="outline">
              <label className="cursor-pointer" htmlFor="data-tools-file">
                Escolher arquivo
                <input
                  accept=".csv,text/csv"
                  className="sr-only"
                  id="data-tools-file"
                  onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])}
                  type="file"
                />
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/dados` nos dois temas e em mobile/desktop. Confirme:
"Baixar CSV" gera um arquivo por tipo de registro (abra um no Excel/planilha
e confira acentuação correta — o BOM precisa estar intacto), trocar o tipo
no seletor de importação muda o destino da importação, escolher um arquivo
CSV importa os registros, e "Gerar relatório PDF" abre `/relatorio` numa
aba nova (essa página não muda nesta fase).

- [ ] **Step 4: Commit**

```bash
git add components/data-tools-route.tsx
git commit -m "refactor: restyle data tools route with shadcn"
```

---

### Task 3: Restilizar `components/accounts-route.tsx`

**Files:**

- Modify: `components/accounts-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Badge`, `Button`, `Card`/..., `Dialog`/...,
  `Input`, `Label`, `Select`/..., `Table`/... (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `AccountsRoute({
initialAccounts, initialRequests })` continua igual; `PasswordRequests` e
  `AccountModal` continuam componentes internos não exportados.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { PasswordRequest, PublicAccount } from '@/lib/types';

type AccountStatusVariant = 'success' | 'warning' | 'destructive';

function accountStatusVariant(status: string): AccountStatusVariant {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  return 'destructive';
}

function accountStatusLabel(status: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'suspended') return 'Suspensa';
  return 'Cancelada';
}

export default function AccountsRoute({
  initialAccounts,
  initialRequests,
}: {
  initialAccounts: PublicAccount[];
  initialRequests: PasswordRequest[];
}) {
  const { notify, confirm } = useFeedback();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [requests, setRequests] = useState(initialRequests);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const active = accounts.filter((account) => account.status === 'active').length;
  const suspended = accounts.length - active;
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts', { cache: 'no-store' });
      const result = (await response.json()) as {
        error?: string;
        accounts?: PublicAccount[];
        requests?: PasswordRequest[];
      };
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as contas.');
      setAccounts(result.accounts || []);
      setRequests(result.requests || []);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível carregar as contas.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };
  const update = async (account: PublicAccount, status: string) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a conta.');
      setNotice(status === 'active' ? 'Conta ativada.' : 'Conta atualizada.');
      notify(status === 'active' ? 'Conta ativada.' : 'Conta atualizada.', 'success');
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível atualizar a conta.',
        'error',
      );
    }
  };
  const remove = async (account: PublicAccount) => {
    if (!(await confirm(`Excluir a conta de ${account.name} e todos os dados dessa loja?`)))
      return;
    try {
      const response = await fetch(`/api/accounts?id=${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir.');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };
  const metrics = [
    { title: 'Total de contas', value: String(accounts.length), detail: 'Incluindo administrador' },
    { title: 'Contas ativas', value: String(active), detail: 'Com acesso liberado' },
    {
      title: 'Suspensas ou canceladas',
      value: String(suspended),
      detail: 'Sem acesso ao sistema',
    },
  ];
  return (
    <>
      <PageHeader
        title="Contas de lojistas"
        description="Gestão administrativa dos ambientes multiempresa."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setModal(true)}>
              Nova conta
            </Button>
          </div>
        }
      />
      <section
        aria-label="Resumo de contas"
        className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
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
      <PasswordRequests accounts={accounts} requests={requests} onChanged={load} />
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Lojistas cadastrados</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada conta visualiza somente os dados da própria assistência.
            </p>
          </div>
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="outline">
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ {notice}</p>}
          <div className="grid gap-3 md:hidden">
            {accounts.map((account) => (
              <article className="grid gap-2 rounded-lg border p-4" key={account.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong>{account.name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {account.role === 'admin' ? 'Administrador' : 'Lojista'}
                    </p>
                  </div>
                  <Badge variant={accountStatusVariant(account.status)}>
                    {accountStatusLabel(account.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>
                    Usuário: <strong>{account.username}</strong>
                  </p>
                  <p>
                    Plano: <strong>{account.plan || 'Mensal'}</strong>
                  </p>
                  <p className="col-span-2">
                    Vencimento:{' '}
                    <strong>
                      {account.dueDate
                        ? new Date(`${account.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                        : '—'}
                    </strong>
                  </p>
                </div>
                {account.role !== 'admin' && (
                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    <Button
                      onClick={() =>
                        void update(account, account.status === 'active' ? 'suspended' : 'active')
                      }
                      size="sm"
                      variant="outline"
                    >
                      {account.status === 'active' ? 'Suspender' : 'Ativar'}
                    </Button>
                    <Button
                      onClick={() => void update(account, 'cancelled')}
                      size="sm"
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                    <Button onClick={() => void remove(account)} size="sm" variant="destructive">
                      Excluir
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.role === 'admin' ? 'Administrador' : 'Lojista'}
                      </p>
                    </TableCell>
                    <TableCell>{account.username}</TableCell>
                    <TableCell>{account.plan || 'Mensal'}</TableCell>
                    <TableCell>
                      {account.dueDate
                        ? new Date(`${account.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={accountStatusVariant(account.status)}>
                        {accountStatusLabel(account.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {account.role !== 'admin' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              void update(
                                account,
                                account.status === 'active' ? 'suspended' : 'active',
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            {account.status === 'active' ? 'Suspender' : 'Ativar'}
                          </Button>
                          <Button
                            onClick={() => void update(account, 'cancelled')}
                            size="sm"
                            variant="outline"
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={() => void remove(account)}
                            size="sm"
                            variant="destructive"
                          >
                            Excluir
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {modal && (
        <AccountModal
          close={() => setModal(false)}
          saved={async () => {
            setModal(false);
            setNotice('Nova conta criada com sucesso.');
            await load();
          }}
        />
      )}
    </>
  );
}

function PasswordRequests({
  accounts,
  requests,
  onChanged,
}: {
  accounts: PublicAccount[];
  requests: PasswordRequest[];
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<PublicAccount | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) {
      setError('As senhas não correspondem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          id: selected.id,
          password: form.get('password'),
          identityConfirmed: form.get('identityConfirmed') === 'on',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível redefinir.');
      setNotice('Senha redefinida. Informe a nova senha ao lojista pelo contato já conhecido.');
      setSelected(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitações de senha ({requests.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirme a identidade pelo contato já cadastrado antes de liberar o acesso.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {requests.length ? (
          <div className="grid gap-2">
            {requests.map((request) => {
              const account = accounts.find((item) => item.id === request.accountId);
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  key={request.id}
                >
                  <div>
                    <strong>{account?.name || request.username}</strong>
                    <p className="text-sm text-muted-foreground">
                      Usuário: {request.username} ·{' '}
                      {new Date(request.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    disabled={!account}
                    onClick={() => {
                      setSelected(account || null);
                      setError('');
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Definir nova senha
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
        )}
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="accounts-reset-select">Redefinir acesso de um lojista</Label>
          <Select
            onValueChange={(value) => {
              setSelected(accounts.find((account) => account.id === value) || null);
              setError('');
            }}
            value={selected?.id ?? ''}
          >
            <SelectTrigger className="w-full" id="accounts-reset-select">
              <SelectValue placeholder="Selecione uma conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((account) => account.role !== 'admin')
                .map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.username})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      {selected && (
        <Dialog open onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-md p-0">
            <form className="grid gap-6 p-6" onSubmit={reset}>
              <DialogHeader>
                <DialogTitle>Nova senha de {selected.name}</DialogTitle>
                <DialogDescription>Usuário: {selected.username}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="accounts-reset-password">Nova senha</Label>
                <Input
                  autoComplete="new-password"
                  id="accounts-reset-password"
                  minLength={10}
                  name="password"
                  required
                  type="password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accounts-reset-confirm">Confirmar senha</Label>
                <Input
                  autoComplete="new-password"
                  id="accounts-reset-confirm"
                  minLength={10}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use pelo menos 10 caracteres, com letras e números.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  className="size-4 shrink-0"
                  id="accounts-reset-confirmed"
                  name="identityConfirmed"
                  required
                  type="checkbox"
                />
                <Label className="font-normal" htmlFor="accounts-reset-confirmed">
                  Confirmei a identidade do lojista pelo contato já conhecido.
                </Label>
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  type="button"
                  variant="outline"
                >
                  Cancelar
                </Button>
                <Button disabled={busy} type="submit">
                  {busy ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function AccountModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState('Mensal');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          username: form.get('username'),
          password: form.get('password'),
          plan,
          dueDate: form.get('dueDate'),
          status: 'active',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar a conta.');
      await saved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conta.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nova conta de lojista</DialogTitle>
            <DialogDescription>
              Crie um ambiente separado para a nova assistência.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="account-name">Nome da loja ou responsável *</Label>
            <Input id="account-name" name="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-username">Usuário de acesso *</Label>
              <Input
                autoComplete="off"
                id="account-username"
                minLength={3}
                name="username"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-password">Senha inicial *</Label>
              <Input
                autoComplete="new-password"
                id="account-password"
                minLength={10}
                name="password"
                required
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Use no mínimo 10 caracteres, com letras e números.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-plan">Plano</Label>
              <Select onValueChange={setPlan} value={plan}>
                <SelectTrigger className="w-full" id="account-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                  <SelectItem value="Trimestral">Trimestral</SelectItem>
                  <SelectItem value="Anual">Anual</SelectItem>
                  <SelectItem value="Cortesia">Cortesia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-due-date">Próximo vencimento</Label>
              <Input id="account-due-date" name="dueDate" type="date" />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Criando...' : 'Criar conta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `plan` (em `AccountModal`) segue controlado pelo mesmo motivo do
`Select`/`FormData` descrito nos Global Constraints; `submit` monta o
payload com a variável `plan`, nunca com `form.get('plan')`.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Entre com a conta administradora (`role = 'admin'`) — contas comuns são
redirecionadas para `/` ao abrir `/contas`. Run: `pnpm dev`. Abra `/contas`
nos dois temas e em mobile/desktop. Confirme: métricas corretas, criar uma
conta nova com um plano diferente de "Mensal" e conferir que o plano salvo
é o escolhido (não "Mensal" por engano), suspender/ativar/cancelar/excluir
uma conta que não seja a do administrador, e redefinir a senha de um
lojista pelo seletor "Redefinir acesso de um lojista".

- [ ] **Step 4: Commit**

```bash
git add components/accounts-route.tsx
git commit -m "refactor: restyle accounts route with shadcn"
```

---

### Task 4: Restilizar `components/business-assistant-route.tsx`

**Files:**

- Modify: `components/business-assistant-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Button`, `Card`/`CardContent`/`CardHeader`/
  `CardTitle`, `Input` (shadcn/local primitives).
- Produces: nenhuma mudança de interface —
  `BusinessAssistantRoute({ orders, parts, payments })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import { formatMoney as money } from '@/lib/format';
import type { Order, Part, Payment } from '@/lib/types';

type ChatMessage = { role: 'ai' | 'me'; text: string };

const suggestions = ['Como está meu estoque?', 'Qual minha receita?', 'O que devo priorizar?'];

export default function BusinessAssistantRoute({
  orders,
  parts,
  payments,
}: {
  orders: (Order & { id: string })[];
  parts: (Part & { id: string })[];
  payments: (Payment & { id: string })[];
}) {
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.value || 0), 0);
  const low = parts.filter((part) => Number(part.stock) < 5);
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Olá! Sou a Reparo IA. Pergunte sobre ordens, receita, estoque ou prioridades da sua assistência.',
    },
  ]);
  const answer = (question: string) => {
    const normalized = question.toLowerCase();
    if (normalized.includes('receita') || normalized.includes('fatur'))
      return `A receita registrada é ${money(revenue)}, com ${payments.length} recebimentos.`;
    if (
      normalized.includes('estoque') ||
      normalized.includes('produto') ||
      normalized.includes('peça')
    )
      return low.length
        ? `${low.length} itens estão com estoque abaixo de 5 unidades: ${low
            .slice(0, 5)
            .map((part) => part.name)
            .join(', ')}.`
        : `Você possui ${parts.length} produtos cadastrados e nenhum está em nível crítico.`;
    if (normalized.includes('ordem') || normalized.includes('serviço'))
      return `Existem ${orders.length} ordens no total e ${orders.filter((order) => order.stage !== 'Retirada').length} ainda estão no fluxo de atendimento.`;
    if (
      normalized.includes('prioridade') ||
      normalized.includes('fazer') ||
      normalized.includes('hoje')
    )
      return low.length
        ? 'Minha sugestão: confira o estoque baixo e depois priorize as ordens mais antigas em reparo.'
        : 'Minha sugestão: priorize as ordens mais antigas e confirme os recebimentos pendentes.';
    return `Analisei seus dados: ${orders.length} ordens, ${parts.length} produtos e ${money(revenue)} em recebimentos. Você pode perguntar “como está meu estoque?”, “qual minha receita?” ou “o que devo priorizar?”.`;
  };
  const send = () => {
    const text = input.trim();
    if (!text) return;
    setChat((current) => [...current, { role: 'me', text }, { role: 'ai', text: answer(text) }]);
    setInput('');
  };
  const insights = [
    {
      title: 'Serviços',
      text: orders.length
        ? `${orders.length} ordens cadastradas, sendo ${orders.filter((order) => order.stage !== 'Retirada').length} ainda em fluxo.`
        : 'Crie ordens para receber análises de desempenho.',
    },
    {
      title: 'Estoque',
      text: low.length
        ? `${low.length} itens estão com estoque abaixo de 5 unidades.`
        : 'Nenhum item está em nível crítico.',
    },
    {
      title: 'Financeiro',
      text: revenue
        ? `A receita registrada é ${money(revenue)}.`
        : 'Registre recebimentos para acompanhar receita e margem.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Assistente IA"
        description="Resumo local baseado nos dados da sua assistência."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Resumo do negócio</CardTitle>
            <p className="text-sm text-muted-foreground">Reparo IA · baseada nos seus dados</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {insights.map((insight) => (
              <article className="grid gap-1 rounded-lg border p-3" key={insight.title}>
                <strong className="text-sm">{insight.title}</strong>
                <p className="text-sm text-muted-foreground">{insight.text}</p>
              </article>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Converse com a Reparo IA</CardTitle>
            <p className="text-sm text-muted-foreground">Online · versão local em preparação</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid max-h-[360px] gap-2 overflow-y-auto rounded-lg border p-3">
              {chat.map((message, index) => (
                <div
                  className={
                    message.role === 'me'
                      ? 'ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                  }
                  key={index}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  size="sm"
                  variant="outline"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') send();
                }}
                placeholder="Pergunte sobre sua assistência..."
                value={input}
              />
              <Button onClick={send} size="icon" type="button">
                ➤
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/assistente` nos dois temas e em mobile/desktop.
Confirme: clicar num chip de sugestão preenche o campo sem enviar
automaticamente, Enter no campo envia a mensagem e adiciona a resposta da
IA, e as mensagens "me"/"ai" ficam visualmente distintas (alinhamento e
cor).

- [ ] **Step 4: Commit**

```bash
git add components/business-assistant-route.tsx
git commit -m "refactor: restyle business assistant route with shadcn"
```

---

### Task 5: Restilizar `components/support-route.tsx`

**Files:**

- Modify: `components/support-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Button`, `Card`/`CardContent`, `Dialog`/...,
  `Input`, `Label`, `Select`/..., `Textarea` (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `SupportRoute({
initialTutorials })` continua igual; `TutorialModal` continua um
  componente interno não exportado.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { Tutorial } from '@/lib/types';

type TutorialRow = Tutorial & { id: string };

const guides = [
  ['Começando', 'Cadastre sua assistência e o primeiro cliente.'],
  ['Ordens de serviço', 'Crie uma OS, registre custos e acompanhe pela Mesa.'],
  ['Estoque', 'Cadastre produtos, custos, preços e disponibilidade.'],
  ['Financeiro', 'Registre entradas e despesas para acompanhar o resultado.'],
  ['Orçamentos', 'Envie propostas e registre a decisão do cliente.'],
  ['Garantias', 'Acompanhe aparelhos entregues e retornos.'],
] as const;

const categories = [
  'Começando',
  'Ordens de serviço',
  'Estoque',
  'Financeiro',
  'Orçamentos',
  'Garantias',
  'Outros',
];

export default function SupportRoute({ initialTutorials }: { initialTutorials: TutorialRow[] }) {
  const { notify } = useFeedback();
  const [tutorials, setTutorials] = useState(initialTutorials);
  const [modal, setModal] = useState(false);
  const save = async (data: Tutorial) => {
    try {
      const response = await fetch('/api/tutorials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Tutorial };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível adicionar o tutorial.');
      setTutorials((current) => [{ id: result.record!.id, ...result.record!.data }, ...current]);
      setModal(false);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível adicionar o tutorial.',
        'error',
      );
      throw error;
    }
  };
  const open = () => setModal(true);
  const youtube = (url: string) => {
    const match = String(url).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/,
    );
    return match?.[1];
  };
  return (
    <>
      <PageHeader
        title="Tutoriais & suporte"
        description="Guias e vídeos carregados no servidor para a conta atual."
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
              Central de ajuda
            </p>
            <h2 className="text-lg font-semibold">Aprenda a usar o ReparoSM</h2>
          </div>
          <Button onClick={open} size="sm" variant="secondary">
            Adicionar vídeo
          </Button>
        </CardContent>
      </Card>
      {tutorials.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Vídeos da assistência</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card key={tutorial.id}>
                <CardContent className="grid gap-2">
                  {youtube(tutorial.url) ? (
                    <iframe
                      allowFullScreen
                      className="aspect-video w-full rounded-lg"
                      src={`https://www.youtube.com/embed/${youtube(tutorial.url)}`}
                      title={tutorial.title}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-2xl">
                      ▶
                    </div>
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {tutorial.category || 'Tutorial'}
                  </span>
                  <h3 className="font-semibold">{tutorial.title}</h3>
                  <p className="text-sm text-muted-foreground">{tutorial.description}</p>
                  <Button asChild className="w-fit" size="sm" variant="outline">
                    <a href={tutorial.url} rel="noreferrer" target="_blank">
                      Assistir vídeo →
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      <h2 className="mb-3 text-lg font-semibold">Guias rápidos</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide, index) => (
          <Card key={guide[0]}>
            <CardContent className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                GUIA RÁPIDO · {index + 1}
              </span>
              <h3 className="font-semibold">{guide[0]}</h3>
              <p className="text-sm text-muted-foreground">{guide[1]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong>Como adicionar um vídeo?</strong>
            <p className="text-sm text-muted-foreground">
              Clique em &quot;Adicionar vídeo&quot;, cole o link do YouTube e preencha o título.
              Ele aparecerá nesta página automaticamente.
            </p>
          </div>
          <Button onClick={open} variant="outline">
            Adicionar vídeo
          </Button>
        </CardContent>
      </Card>
      {modal && <TutorialModal close={() => setModal(false)} save={save} />}
    </>
  );
}

function TutorialModal({
  close,
  save,
}: {
  close: () => void;
  save: (data: Tutorial) => Promise<void>;
}) {
  const [category, setCategory] = useState(categories[0]);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void save({
              title: String(form.get('title') || ''),
              url: String(form.get('url') || ''),
              category,
              description: String(form.get('description') || ''),
              createdAt: new Date().toISOString(),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Adicionar vídeo</DialogTitle>
            <DialogDescription>Publique um tutorial na central de ajuda.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-title">Título do vídeo *</Label>
            <Input
              id="tutorial-title"
              name="title"
              placeholder="Ex.: Como criar uma ordem de serviço"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-url">Link do YouTube *</Label>
            <Input
              id="tutorial-url"
              name="url"
              placeholder="https://youtube.com/watch?v=..."
              required
              type="url"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-category">Categoria</Label>
            <Select onValueChange={setCategory} value={category}>
              <SelectTrigger className="w-full" id="tutorial-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-description">Descrição</Label>
            <Textarea
              id="tutorial-description"
              name="description"
              placeholder="Explique rapidamente o que o usuário aprenderá."
            />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button type="submit">Adicionar vídeo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `category` segue controlado pelo mesmo motivo do `Select`/`FormData`
descrito nos Global Constraints; o `submit` usa a variável `category`,
nunca `form.get('category')`.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/suporte` nos dois temas e em mobile/desktop.
Confirme: adicionar um vídeo do YouTube válido mostra o `<iframe>`
incorporado no card, adicionar um vídeo com um link que não seja do
YouTube mostra o placeholder `▶` em vez de tentar montar um iframe vazio,
e a categoria escolhida no modal é a que aparece salva no card (não fica
sempre em "Começando").

- [ ] **Step 4: Commit**

```bash
git add components/support-route.tsx
git commit -m "refactor: restyle support route with shadcn"
```

---

### Task 6: Fechamento da fase

**Files:**

- Inspect: todos os arquivos tocados nas Tasks 1-5
- Inspect and modify: `app/globals.css` (somente seletores exclusivos das
  telas 3c)

- [ ] **Step 1: Limpeza de CSS legado**

Inspecione `app/globals.css` e procure, com `rg`, os seletores usados pelas
telas migradas nas Tasks 1-5 (`.shop-v2`, `.shop-cover`, `.shop-avatar`,
`.shop-tabs`, `.shop-edit`, `.form-heading`, `.whatsapp-status`,
`.whatsapp-connect`, `.wa-connected`, `.wa-offline`, `.wa-success`,
`.wa-test`, `.wa-actions`, `.wa-config`, `.data-hero`, `.export-grid`,
`.import-card`, `.accounts-hero`, `.account-metrics`, `.account-notice`,
`.recovery-panel`, `.recovery-row`, `.accounts-table`, `.assistant-layout`,
`.insights`, `.ai-heading`, `.insight`, `.chat`, `.chat-head`, `.messages`,
`.message`, `.suggestions`, `.composer`, `.support-hero`, `.support-add`,
`.tutorial-grid`, `.lesson-grid`, `.support-contact`, entre outros). Remova
apenas regras exclusivas de Minha assistência, Dados, Contas, Assistente e
Suporte que deixaram de ter consumidores. **Não remova** `.report-*` nem
`.print-order-*` — pertencem a `report-route.tsx` (Relatório) e à
impressão de OS, ambos fora do escopo desta fase e do próprio redesenho
visual. Preserve também qualquer seletor genérico ainda usado por outras
telas (`.badge`, `.panel`, `.modal-backdrop`, etc., se ainda restar algum
consumidor fora do painel).

- [ ] **Step 2: Suíte completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde (nenhum teste de negócio deveria ter sido afetado — é
refatoração puramente visual). Confirme que os pré-requisitos locais estão
configurados para que os testes de banco não sejam ignorados.

- [ ] **Step 3: Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [ ] **Step 4: Checagem visual final**

Run: `pnpm dev`. Percorra `/minha-assistencia`, `/dados`, `/contas` (com a
conta administradora), `/assistente` e `/suporte` nos dois temas e em
mobile (~375px) e desktop (~1280px). Confirme ausência de estilos legados
destoando do restante do painel, e que `/relatorio` continua intacto
(sem sidebar, sem tema, formatado para impressão).

- [ ] **Step 5: Commit da limpeza de CSS**

```bash
git add app/globals.css
git commit -m "refactor: remove migrated screen styles (phase 3c)"
```

- [ ] **Step 6: Push e PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: redesign my-shop, data tools, accounts, assistant and support screens" --body "Fase 3c do redesenho visual: migra Minha assistência, Dados e exportação, Contas de lojistas, Assistente e Tutoriais & suporte para Tailwind v4 + shadcn/ui. Relatório (/relatorio) fica fora do escopo por ser uma folha de impressão sem sidebar/tema. Nenhuma regra de negócio muda."
```

Aguarde o CI passar antes de mesclar.
