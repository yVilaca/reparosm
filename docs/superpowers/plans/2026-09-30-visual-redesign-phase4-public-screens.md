# Redesenho visual — Fase 4: Vitrine, Orçamento público, Impressão de OS e Relatório Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as telas públicas restantes — Vitrine (`public-store-route.tsx`),
Orçamento público (`app/o/[id]/page.tsx`), Impressão de OS
(`app/(painel)/ordens/[id]/imprimir/page.tsx` e os componentes
`print-order-button.tsx`/`print-order-photos.tsx`) e o Relatório
(`report-route.tsx`) — do CSS legado para Tailwind v4 + shadcn/ui, sem
alterar nenhuma regra de negócio. Esta é a última fase do redesenho visual
iniciado na Fase 1; ao final, `app/globals.css` fica reduzido apenas a
tokens/imports do Tailwind (sem nenhuma regra `.minha-classe` por tela).

**Por que o Relatório entra aqui, ao contrário do combinado na Fase 3c:**
na Fase 3c, excluí `report-route.tsx` do escopo achando que ficaria como
uma exceção permanente (como a impressão de OS, que também só existe para
`window.print()`). Mas a Fase 1 já previa "`app/globals.css` só é
totalmente esvaziado ao final da fase 4" — ou seja, a intenção original
sempre foi zerar o CSS customizado por completo, Relatório incluído. Como
a técnica desta fase para a impressão de OS (variantes `print:` do
Tailwind, sem nenhuma regra `@media print` escrita à mão) se aplica
igualmente ao Relatório, incluí-lo aqui em vez de deixar uma exceção
permanente. É um acréscimo pequeno (1 arquivo, ~160 linhas) ao escopo
original da Fase 4.

**Achado novo nesta fase — três arquivos CSS órfãos:** `app/accounts.css`,
`app/recovery.css` e `app/whatsapp.css` ainda são importados em
`app/layout.tsx`, mas toda tela que usava suas classes (login — Fase 1;
Contas e Minha assistência — Fase 3c) já foi migrada para shadcn. Uma
busca por `className` com cada um dos 20 seletores desses três arquivos
não encontrou nenhum consumidor restante — são código morto. A Task 1
remove os três arquivos e seus imports antes de qualquer outra mudança,
para começar a fase com o terreno limpo.

**Architecture:** Estas quatro telas não usam o shell do painel (sem
sidebar, sem `PageHeader`) — são páginas autônomas (`<main>`/`<div>`
centralizados), vistas por clientes anônimos (Vitrine, Orçamento público)
ou preparadas para impressão (Impressão de OS, Relatório). Reaproveitam os
mesmos primitivos shadcn já usados no painel (`Card`/`CardContent`,
`Button`, `Table`, `EmptyState`) dentro de um layout mais simples. Nas
duas telas de impressão, nenhuma regra CSS nova é escrita: tudo usa as
variantes `print:` nativas do Tailwind v4 (`print:hidden`,
`print:shadow-none`, etc.) diretamente nas classes do JSX.

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind v4, shadcn/ui (já
instalado).

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md`
(Fase 4, mais a extensão ao Relatório justificada acima).

## Pré-requisitos locais

- Configure `DATABASE_URL` para um PostgreSQL local isolado antes de
  executar `pnpm test`. Sem essa variável, os testes que usam banco são
  ignorados. O usuário local do banco precisa poder criar/remover bancos
  temporários `reparosm_test_*` e criar/conceder a role `reparosm_runtime`
  quando necessário (permissões `CREATEDB` e `CREATEROLE`, ou
  superusuário).
- Para `pnpm dev` e a checagem manual, configure `DATABASE_URL` ou
  `NETLIFY_DB_URL` apontando para o **mesmo banco que `.env` já usa** (não
  para o banco usado por `pnpm test`) — um valor diferente faz o servidor
  não achar as contas/tabelas seedadas e o login falha. Configure também
  um `ADMIN_PASSWORD_HASH` local válido. Não inclua valores de
  credenciais neste plano.
- Vitrine e Orçamento público não exigem login — são acessadas por um
  link direto. Para obter um link de teste: abra `/estoque`, clique em
  "Abrir vitrine" (isso usa `/vitrine?loja=<id-da-conta>`); e abra
  `/orcamentos`, crie ou edite um orçamento e clique em "Copiar link"
  (isso usa `/o/<id-do-orçamento>`).

## Global Constraints

- Nenhuma prop, tipo exportado ou lógica de `fetch`/validação muda — só a
  árvore JSX retornada por cada componente/página.
- Reaproveitar exatamente os primitivos shadcn já usados no painel
  (`Card`/`CardContent`, `Button`, `Table`/..., `EmptyState`) — não
  inventar um padrão novo além do "shell de página pública" (um `<main>`
  centralizado, sem sidebar) que as Tasks 2 e 3 estabelecem.
- Nas Tasks 4 e 5 (impressão), usar **somente** variantes `print:` do
  Tailwind diretamente nas classes — não escrever `@media print { ... }`
  à mão nem introduzir um novo arquivo CSS. O controle fica (botão,
  cabeçalho da Mesa de ações) some com `print:hidden`; o cartão do
  documento perde sombra/borda arredondada ao imprimir com
  `print:shadow-none print:border-0 print:rounded-none`.
- Depois de cada task, execute `pnpm format:check`, `pnpm lint` e
  `pnpm typecheck`; faça as verificações manuais descritas na própria
  task.
- Execute `pnpm test` e `pnpm build` uma vez, na suíte completa da
  Task 6. Nenhum destes arquivos tem teste automatizado dedicado hoje — a
  suíte completa existente não deve regredir.
- `pnpm exec graft build && pnpm exec graft check` ao final da fase.

## Review Focus

- Na Vitrine, "Pedir pelo WhatsApp" precisa continuar chamando `ask(part)`
  exatamente como hoje — o link `whatsappUrl(...)` e a mensagem
  pré-preenchida não podem mudar, só o botão que dispara.
- No Orçamento público, a condição de carregamento é
  `loading || loadedId !== id` (não apenas `loading`) — isso evita mostrar
  os dados do orçamento anterior por um instante quando alguém navega
  entre dois links `/o/[id]` diferentes sem recarregar a página. Não
  simplificar para só `loading`.
- Na Impressão de OS, o botão "Imprimir / salvar PDF" e o texto
  "Visualização para impressão" precisam ficar dentro de um contêiner com
  `print:hidden` — sem isso, o botão apareceria na folha impressa/PDF
  gerado.
- No Relatório, o cabeçalho com "Salvar como PDF" também precisa de
  `print:hidden` pelo mesmo motivo; as seções de tabela devem usar
  `break-inside-avoid` para não partir uma tabela ao meio entre duas
  páginas impressas.
- A Vitrine e o Orçamento público são vistos por clientes sem login — a
  reestilização não pode introduzir nada que dependa do shell do painel
  (ex.: não importar `PageHeader`, que pressupõe `title`/`action` de uma
  tela autenticada) nem exigir JavaScript além do que os componentes já
  usam hoje (`'use client'` continua nos mesmos dois arquivos).

---

### Task 1: Remover CSS legado órfão (`accounts.css`, `recovery.css`, `whatsapp.css`)

**Files:**

- Modify: `app/layout.tsx`
- Delete: `app/accounts.css`, `app/recovery.css`, `app/whatsapp.css`

**Interfaces:**

- Consumes: nada novo.
- Produces: nenhuma mudança de interface — só remove imports e arquivos
  sem nenhum consumidor.

- [ ] **Step 1: Remover os imports**

Em `app/layout.tsx`, remova as três linhas:

```ts
import './accounts.css';
import './recovery.css';
import './whatsapp.css';
```

Mantenha `import './globals.css';` intacto.

- [ ] **Step 2: Apagar os três arquivos**

```bash
git rm app/accounts.css app/recovery.css app/whatsapp.css
```

- [ ] **Step 3: Confirmar que nada mais os referencia**

Run: `rg "account-metrics|account-notice|accounts-hero|accounts-table|first-access|login-brand|login-card|login-heading|login-submit|password-toggle|recovery-panel|recovery-row|wa-actions|wa-config|wa-success|wa-test|whatsapp-connect" --type ts`

Expected: nenhum resultado (os únicos usos eram dentro dos próprios
arquivos removidos). Se algo aparecer, pare e investigue antes de seguir
— não force a remoção.

- [ ] **Step 4: Suíte rápida**

Run: `pnpm typecheck && pnpm build`

Expected: ambos passam — a ausência desses três arquivos não quebra o
build porque nenhum componente depende deles.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "chore: remove orphaned accounts/recovery/whatsapp legacy CSS"
```

---

### Task 2: Restilizar `components/public-store-route.tsx` (Vitrine)

**Files:**

- Modify: `components/public-store-route.tsx`

**Interfaces:**

- Consumes: `Button`, `Card`/`CardContent`, `EmptyState` (shadcn/local
  primitives).
- Produces: nenhuma mudança de interface —
  `PublicStoreRoute({ items, shop, error? })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Part, Shop } from '@/lib/types';

const categoryIcons: Record<string, string> = {
  Capinhas: '▣',
  Carregadores: '⌁',
  Acessórios: '◇',
};

export default function PublicStoreRoute({
  items,
  shop,
  error,
}: {
  items: Part[];
  shop: Shop;
  error?: string;
}) {
  const { notify } = useFeedback();
  const [category, setCategory] = useState('Todos');
  const categories = useMemo(
    () => [
      'Todos',
      ...Array.from(new Set(items.map((part) => part.category))).filter((value): value is string =>
        Boolean(value),
      ),
    ],
    [items],
  );
  const visible =
    category === 'Todos' ? items : items.filter((part) => part.category === category);
  const ask = (part: Part) => {
    if (!hasValidWhatsapp(shop.phone))
      return notify('A assistência ainda não cadastrou o WhatsApp.', 'error');
    window.open(
      whatsappUrl(
        shop.phone,
        `Olá! Vi ${part.name} na vitrine da ${shop.name || 'ReparoSM'} e tenho interesse. Valor anunciado: ${formatMoney(part.price)}.`,
      ),
      '_blank',
      'noopener,noreferrer',
    );
  };
  if (error)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="grid gap-2 text-center">
            <h1 className="text-lg font-semibold">Vitrine indisponível</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong className="text-lg">{shop.name || 'ReparoSM'}</strong>
          <p className="text-sm text-muted-foreground">Vitrine online</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {shop.phone || 'Produtos e acessórios para celular'}
        </p>
      </header>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Catálogo online
            </p>
            <h1 className="text-xl font-semibold">Produtos disponíveis</h1>
            <p className="text-sm text-muted-foreground">
              {shop.description ||
                'Escolha um produto e fale diretamente com a assistência pelo WhatsApp.'}
            </p>
          </div>
          <div className="text-right">
            <strong className="text-2xl">{items.length}</strong>
            <p className="text-sm text-muted-foreground">itens disponíveis</p>
          </div>
        </CardContent>
      </Card>
      {categories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <Button
              key={item}
              onClick={() => setCategory(item)}
              size="sm"
              variant={category === item ? 'default' : 'outline'}
            >
              {item}
            </Button>
          ))}
        </div>
      )}
      {visible.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((part, index) => (
            <Card key={`${part.name}-${index}`}>
              <CardContent className="grid gap-2">
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted text-3xl">
                  {part.image ? (
                    // Arbitrary shop images are stored as data or user-provided URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      src={part.image}
                    />
                  ) : (
                    <span aria-hidden="true">{categoryIcons[part.category || ''] || '⚙'}</span>
                  )}
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {part.category || 'Produto'}
                </span>
                <h2 className="font-semibold">{part.name}</h2>
                <p className="text-sm text-muted-foreground">{part.stock} unidades disponíveis</p>
                <strong className="text-lg">{formatMoney(part.price)}</strong>
                <Button onClick={() => ask(part)} size="sm">
                  Pedir pelo WhatsApp
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          description='Os produtos marcados como "Publicar na vitrine" aparecerão aqui.'
          title="Nenhum produto publicado"
        />
      )}
      <footer className="mt-8 flex flex-col items-center gap-1 border-t pt-6 text-center text-sm text-muted-foreground">
        <strong className="text-foreground">{shop.name || 'ReparoSM'}</strong>
        <span>{shop.address || 'Atendimento pelo WhatsApp'}</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev` (sem fazer login). Abra `/vitrine?loja=<id-da-conta>` (veja
"Pré-requisitos locais" para como obter o link) em uma janela anônima, nos
dois temas e em mobile/desktop. Confirme: filtro por categoria funciona,
"Pedir pelo WhatsApp" abre a conversa com a mensagem correta, e abrir
`/vitrine` sem `?loja=` mostra a mensagem de link incompleto.

- [ ] **Step 4: Commit**

```bash
git add components/public-store-route.tsx
git commit -m "refactor: restyle public store (vitrine) with shadcn"
```

---

### Task 3: Restilizar `app/o/[id]/page.tsx` (Orçamento público)

**Files:**

- Modify: `app/o/[id]/page.tsx`

**Interfaces:**

- Consumes: `Button`, `Card`/`CardContent`/`CardHeader` (shadcn
  primitives).
- Produces: nenhuma mudança de interface — a página continua exportando o
  mesmo componente `PublicQuote` como default, sem props (lê `id` via
  `useParams`).

- [ ] **Step 1: Reescrever a página**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatMoney as money } from '@/lib/format';
import type { Quote, QuoteStatus } from '@/lib/types';

type PublicQuote = {
  code?: string;
  customer: string;
  device: string;
  problem?: string;
  service: string;
  notes?: string;
  total?: number;
  validUntil?: string;
  status?: Quote['status'];
  orderId?: string;
};
type PublicQuoteRecord = { id: string; data: PublicQuote };
export default function PublicQuote() {
  const { confirm } = useFeedback();
  const { id } = useParams<{ id: string }>(),
    [record, setRecord] = useState<PublicQuoteRecord | null>(null),
    [done, setDone] = useState<QuoteStatus | ''>(''),
    [loading, setLoading] = useState(true),
    [deciding, setDeciding] = useState(false),
    [loadError, setLoadError] = useState(''),
    [responseError, setResponseError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [loadedId, setLoadedId] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`/api/public/quote?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          record?: PublicQuoteRecord | null;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o orçamento.');
        if (active) {
          setRecord(result.record || null);
          setLoadedId(id);
          setLoadError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadedId(id);
          setLoadError(
            error instanceof Error ? error.message : 'Não foi possível carregar o orçamento.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, id]);
  if (loading || loadedId !== id)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md" aria-busy="true">
          <CardContent className="grid gap-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-20 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-32 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </main>
    );
  if (loadError)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md" role="alert">
          <CardContent className="grid gap-3 text-center">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Link do orçamento
            </p>
            <h1 className="text-lg font-semibold">Não foi possível carregar</h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button
              onClick={() => {
                setLoading(true);
                setLoadError('');
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  if (!record)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="grid gap-2 text-center">
            <h1 className="text-lg font-semibold">Orçamento não encontrado</h1>
            <p className="text-sm text-muted-foreground">
              Verifique se o link recebido está completo.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  const q = record.data;
  const decide = async (status: 'Aprovado' | 'Recusado') => {
    if (deciding) return;
    if (status === 'Recusado') {
      const accepted = await confirm(
        'Recusar este orçamento? Essa resposta será enviada à assistência.',
      );
      if (!accepted) return;
    }
    setDeciding(true);
    setResponseError('');
    try {
      const response = await fetch('/api/public/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, status }),
      });
      const result = (await response.json()) as { error?: string; orderId?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar a resposta.');
      setDone(status);
      setRecord({ ...record, data: { ...q, status, orderId: result.orderId } });
    } catch (error: unknown) {
      setResponseError(
        error instanceof Error ? error.message : 'Não foi possível registrar a resposta.',
      );
    } finally {
      setDeciding(false);
    }
  };
  const answered = done || q.status === 'Aprovado' || q.status === 'Recusado';
  return (
    <main className="flex min-h-dvh justify-center p-4 sm:p-6">
      <Card className="h-fit w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <strong>ReparoSM</strong>
          <span className="text-sm text-muted-foreground">Orçamento {q.code || record.id}</span>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Orçamento para
            </p>
            <h1 className="text-xl font-semibold">{q.customer}</h1>
            <p className="text-sm text-muted-foreground">{q.device}</p>
          </div>
          {q.problem && (
            <div>
              <p className="text-xs text-muted-foreground">Problema relatado</p>
              <p className="text-sm">{q.problem}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Serviço proposto</p>
            <p className="text-sm">{q.service}</p>
          </div>
          {q.notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{q.notes}</p>
            </div>
          )}
          <div className="grid gap-1 rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Valor total</p>
            <strong className="text-2xl">{money(q.total)}</strong>
            {q.validUntil && (
              <span className="text-xs text-muted-foreground">
                Válido até {new Date(`${q.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {answered ? (
            <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              Resposta registrada: <strong>{done || q.status}</strong>
              {(done || q.status) === 'Aprovado' && (
                <p className="mt-1">
                  Sua ordem de serviço foi criada e a assistência já pode iniciar o atendimento.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {responseError && (
                <p className="text-sm text-destructive" role="alert">
                  {responseError}
                </p>
              )}
              <Button disabled={deciding} onClick={() => decide('Aprovado')}>
                {deciding ? 'Registrando...' : 'Aprovar orçamento'}
              </Button>
              <Button disabled={deciding} onClick={() => decide('Recusado')} variant="outline">
                Recusar orçamento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

Note: o componente continua se chamando `PublicQuote` — mesmo nome do
tipo `PublicQuote` já declarado no arquivo. Isso é válido em TypeScript
(tipos e valores vivem em espaços de nome separados) e já era assim no
arquivo original; não renomear.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev` (sem fazer login). Abra `/o/<id-do-orçamento>` (veja
"Pré-requisitos locais") em uma janela anônima, nos dois temas. Confirme:
o esqueleto de carregamento aparece brevemente, "Aprovar orçamento" e
"Recusar orçamento" funcionam (recusar pede confirmação antes), a tela de
sucesso aparece após decidir, e recarregar a página com um orçamento já
decidido mostra direto a tela de sucesso (sem os botões de decisão). Teste
também um `id` inexistente (ex.: `/o/id-invalido`) para ver a tela "não
encontrado".

- [ ] **Step 4: Commit**

```bash
git add "app/o/[id]/page.tsx"
git commit -m "refactor: restyle public quote page with shadcn"
```

---

### Task 4: Restilizar a impressão de OS

**Files:**

- Modify: `app/(painel)/ordens/[id]/imprimir/page.tsx`
- Modify: `components/print-order-button.tsx`
- Modify: `components/print-order-photos.tsx`

**Interfaces:**

- Consumes: `Button`, `Card`/`CardContent` (shadcn primitives).
- Produces: nenhuma mudança de interface — `PrintOrderButton` e
  `PrintOrderPhotos({ photos })` continuam iguais; a página continua sem
  props além de `params`.

- [ ] **Step 1: Reescrever `components/print-order-button.tsx`**

```tsx
'use client';

import { Button } from '@/components/ui/button';

export default function PrintOrderButton() {
  return (
    <Button onClick={() => window.print()} type="button">
      Imprimir / salvar PDF
    </Button>
  );
}
```

- [ ] **Step 2: Reescrever `components/print-order-photos.tsx`**

```tsx
export type PrintPhoto = { id: string; contentType: string };

export default function PrintOrderPhotos({ photos }: { photos: PrintPhoto[] }) {
  if (!photos.length) return null;
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 font-semibold">Fotos de prova</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element -- printed page, not the app shell
          <img
            alt="Foto de prova da ordem"
            className="aspect-square w-full rounded-lg border object-cover"
            key={photo.id}
            src={`/api/order-photos/${photo.id}`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Reescrever a página**

```tsx
import { notFound } from 'next/navigation';
import PrintOrderButton from '@/components/print-order-button';
import PrintOrderPhotos from '@/components/print-order-photos';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { orders, shops } from '@/lib/repos';
import * as orderPhotos from '@/lib/repos/order-photos';
import { requireServerAccount } from '@/lib/server-auth';
import { warrantyPeriod } from '@/lib/warranty';

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, account] = await Promise.all([params, requireServerAccount()]);
  const [order, shop, photos] = await Promise.all([
    orders.get(account.id, id),
    shops.get(account.id, 'shop-main'),
    orderPhotos.list(account.id, id),
  ]);
  if (!order) notFound();

  const data = order.data;
  const warrantyDays = data.warrantyDays;
  const expiresAt = warrantyPeriod(data.deliveredAt, warrantyDays).expiresAt;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <span className="text-sm text-muted-foreground">Visualização para impressão</span>
        <PrintOrderButton />
      </div>
      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <CardContent className="grid gap-6 p-6 sm:p-8 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
            <div>
              <h1 className="text-lg font-semibold">
                {shop?.data.name || shop?.data.legalName || 'Assistência técnica'}
              </h1>
              {shop?.data.legalName && (
                <p className="text-sm text-muted-foreground">{shop.data.legalName}</p>
              )}
              {shop?.data.document && (
                <p className="text-sm text-muted-foreground">Documento: {shop.data.document}</p>
              )}
              {shop?.data.address && (
                <p className="text-sm text-muted-foreground">{shop.data.address}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {[shop?.data.phone, shop?.data.email].filter(Boolean).join(' · ') ||
                  'Dados de contato não informados'}
              </p>
            </div>
            <div className="text-right">
              <strong className="text-xs tracking-wide uppercase">Ordem de serviço</strong>
              <p className="text-2xl font-semibold">{data.code}</p>
              <p className="text-xs text-muted-foreground">
                Emitida em {dateLabel(new Date().toISOString())}
              </p>
            </div>
          </header>

          <section className="break-inside-avoid">
            <h2 className="mb-2 font-semibold">Cliente</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" value={data.customer} />
              <Field label="Telefone" value={data.phone} />
            </div>
          </section>

          <section className="break-inside-avoid">
            <h2 className="mb-2 font-semibold">Aparelho e atendimento</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Aparelho" value={data.device} />
              <Field label="IMEI / número de série" value={data.imei} />
              <Field label="Etapa" value={data.stage || 'Recebido'} />
              <Field label="Técnico" value={data.technician || shop?.data.technician} />
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="Problema relatado" value={data.problem} />
              <Field label="Serviço" value={data.service} />
              <Field label="Observações" value={data.notes} />
            </div>
          </section>

          <section className="break-inside-avoid">
            <h2 className="mb-2 font-semibold">Valores e garantia</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mão de obra" value={formatMoney(data.labor)} />
              <Field label="Peças" value={formatMoney(data.parts)} />
              <Field label="Total" value={formatMoney(data.total)} />
              <Field
                label="Data de retirada"
                value={data.deliveredAt ? dateOnlyLabel(data.deliveredAt) : 'Não entregue'}
              />
              <Field
                label="Garantia"
                value={
                  warrantyDays
                    ? `${warrantyDays} dias${expiresAt ? ` · válida até ${dateOnlyLabel(expiresAt)}` : ''}`
                    : 'Não informada'
                }
              />
            </div>
          </section>

          <PrintOrderPhotos photos={photos} />

          {shop?.data.terms && (
            <section className="break-inside-avoid">
              <h2 className="mb-2 font-semibold">Termos da assistência</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {shop.data.terms}
              </p>
            </section>
          )}

          <footer className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2">
            <div className="border-t pt-2 text-center">
              <p className="text-sm font-medium">Assinatura do cliente</p>
              <p className="text-xs text-muted-foreground">{data.customer}</p>
            </div>
            <div className="border-t pt-2 text-center">
              <p className="text-sm font-medium">Assinatura da assistência</p>
              <p className="text-xs text-muted-foreground">
                {data.technician || shop?.data.technician || 'Responsável técnico'}
              </p>
            </div>
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{text || '—'}</p>
    </div>
  );
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(value),
  );
}

function dateOnlyLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  );
}
```

Note: a página continua sendo um Server Component (sem `'use client'`) —
só `PrintOrderButton` precisa do `onClick`, exatamente como hoje.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 5: Verificação manual**

Run: `pnpm dev`. Abra `/ordens`, clique em "Imprimir OS" numa ordem com
fotos e garantia preenchidas, nos dois temas. Confirme: a tela on-screen
mostra o botão e o aviso normalmente; abra o diálogo de impressão do
navegador (Ctrl+P) ou a pré-visualização de impressão e confirme que o
botão e o aviso desaparecem (`print:hidden`), o cartão perde sombra/borda
arredondada, e as fotos de prova aparecem em grade na folha.

- [ ] **Step 6: Commit**

```bash
git add components/print-order-button.tsx components/print-order-photos.tsx "app/(painel)/ordens/[id]/imprimir/page.tsx"
git commit -m "refactor: restyle order print page with Tailwind print variants"
```

---

### Task 5: Restilizar `components/report-route.tsx` (Relatório)

**Files:**

- Modify: `components/report-route.tsx`

**Interfaces:**

- Consumes: `Button`, `Card`/`CardContent`, `Table`/... (shadcn
  primitives).
- Produces: nenhuma mudança de interface — `ReportRoute({ initialRecords })`
  continua igual; `Report` continua um componente interno não exportado.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney as money } from '@/lib/format';
import type { DataObject, StoredRecord } from '@/lib/types';

export default function ReportRoute({ initialRecords }: { initialRecords: StoredRecord[] }) {
  const records = initialRecords;
  const by = (type: string): DataObject[] =>
    records.filter((record) => record.type === type).map((record) => record.data);
  const clients = by('client');
  const orders = by('order');
  const payments = by('payment');
  const expenses = by('expense');
  const parts = by('part');
  const quotes = by('quote');
  const income = payments.reduce((sum, payment) => sum + Number(payment.value || 0), 0);
  const out = expenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);
  const metrics = [
    { title: 'Receita', value: money(income) },
    { title: 'Despesas', value: money(out) },
    { title: 'Resultado', value: money(income - out) },
    { title: 'Ordens', value: String(orders.length) },
    { title: 'Clientes', value: String(clients.length) },
    {
      title: 'Itens em estoque',
      value: String(parts.reduce((sum, part) => sum + Number(part.stock || 0), 0)),
    },
  ];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 print:max-w-none print:p-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 print:hidden">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            ReparoSM
          </p>
          <h1 className="text-xl font-semibold">Relatório geral da assistência</h1>
          <p className="text-sm text-muted-foreground">
            Gerado em {new Date().toLocaleString('pt-BR')}
          </p>
        </div>
        <Button onClick={() => window.print()} type="button">
          Salvar como PDF
        </Button>
      </header>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              <p className="text-lg font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <Report
        title="Ordens de serviço"
        rows={orders}
        columns={[
          ['Código', 'code'],
          ['Cliente', 'customer'],
          ['Aparelho', 'device'],
          ['Etapa', 'stage'],
          ['Total', 'total'],
        ]}
      />
      <Report
        title="Clientes"
        rows={clients}
        columns={[
          ['Nome', 'name'],
          ['WhatsApp', 'phone'],
          ['E-mail', 'email'],
          ['Status', 'status'],
        ]}
      />
      <Report
        title="Recebimentos"
        rows={payments}
        columns={[
          ['Descrição', 'description'],
          ['Forma', 'method'],
          ['Data', 'date'],
          ['Valor', 'value'],
        ]}
      />
      <Report
        title="Despesas"
        rows={expenses}
        columns={[
          ['Descrição', 'description'],
          ['Forma', 'method'],
          ['Data', 'date'],
          ['Valor', 'value'],
        ]}
      />
      <Report
        title="Estoque"
        rows={parts}
        columns={[
          ['Produto', 'name'],
          ['Categoria', 'category'],
          ['Quantidade', 'stock'],
          ['Custo', 'cost'],
          ['Venda', 'price'],
        ]}
      />
      <Report
        title="Orçamentos"
        rows={quotes}
        columns={[
          ['Código', 'code'],
          ['Cliente', 'customer'],
          ['Aparelho', 'device'],
          ['Status', 'status'],
          ['Total', 'total'],
        ]}
      />
    </main>
  );
}

function Report({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: DataObject[];
  columns: Array<[string, string]>;
}) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column[1]}>{column[0]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map(([, key]) => (
                    <TableCell key={key}>{row[key] == null ? '—' : String(row[key])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum registro.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/dados`, clique em "Gerar relatório PDF", nos dois
temas. Confirme: as 6 métricas e as 6 tabelas aparecem corretas, e no
diálogo de impressão (Ctrl+P) o cabeçalho com o botão "Salvar como PDF"
desaparece.

- [ ] **Step 4: Commit**

```bash
git add components/report-route.tsx
git commit -m "refactor: restyle report route with shadcn and Tailwind print variants"
```

---

### Task 6: Fechamento da fase e da iniciativa de redesenho visual

**Files:**

- Inspect: todos os arquivos tocados nas Tasks 1-5
- Inspect and modify: `app/globals.css` (esvaziar por completo, mantendo
  só tokens/imports do Tailwind)

- [ ] **Step 1: Auditoria final de `app/globals.css`**

Depois das Fases 1-4, nenhuma tela do painel nem as 4 telas públicas desta
fase deveriam depender de uma classe CSS própria. Rode, para cada
seletor que ainda aparecer em `app/globals.css` (use
`rg "^\.[a-zA-Z]" app/globals.css` para listá-los), uma busca por
`className` equivalente em `components/`, `app/`:

```bash
rg "^\.[a-zA-Z][a-zA-Z0-9_-]*" app/globals.css -o | sort -u | while read -r sel; do
  name="${sel#.}"
  echo "=== $name ==="
  rg -l "\"$name\"|'$name'|\`$name\`" components app --type ts
done
```

Para cada seletor sem nenhum resultado, remova a regra correspondente de
`app/globals.css`. Mantenha apenas: os `@import`, `@custom-variant`, as
variáveis `:root`/tema escuro, e qualquer utilitário genuinamente
compartilhado que a busca acima ainda apontar como usado (não deveria
sobrar nenhum, mas confirme antes de assumir).

- [ ] **Step 2: Suíte completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde (nenhum teste de negócio deveria ter sido afetado —
é refatoração puramente visual). Confirme que os pré-requisitos locais
estão configurados para que os testes de banco não sejam ignorados.

- [ ] **Step 3: Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [ ] **Step 4: Checagem visual final**

Run: `pnpm dev`. Percorra `/vitrine?loja=...`, `/o/...`, a impressão de
uma OS e `/relatorio` nos dois temas e em mobile (~375px) e desktop
(~1280px), incluindo a pré-visualização de impressão (Ctrl+P) das duas
telas de impressão. Confirme ausência de estilos legados destoando do
resto do produto.

- [ ] **Step 5: Commit da limpeza final de CSS**

```bash
git add app/globals.css
git commit -m "refactor: empty legacy CSS — visual redesign complete"
```

- [ ] **Step 6: Push e PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: redesign public screens (vitrine, public quote, order print, report)" --body "Fase 4 (final) do redesenho visual: migra Vitrine, Orçamento público, Impressão de OS e Relatório para Tailwind v4 + shadcn/ui, usando variantes print: do Tailwind nas duas telas de impressão em vez de CSS de impressão escrito à mão. Também remove accounts.css/recovery.css/whatsapp.css, órfãos desde as Fases 1 e 3c, e esvazia app/globals.css por completo. Nenhuma regra de negócio muda. Fecha a iniciativa de redesenho visual iniciada na Fase 1."
```

Aguarde o CI passar antes de mesclar.
