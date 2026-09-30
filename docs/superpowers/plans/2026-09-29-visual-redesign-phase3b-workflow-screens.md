# Redesenho visual — Fase 3b: Mesa, Películas, Garantias e Pós-venda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Mesa (kanban), Películas, Garantias e Pós-venda — e o modal
embutido de Películas — do CSS legado para os primitivos shadcn já
estabelecidos nas Fases 1-3a, sem alterar nenhuma regra de negócio.

**Architecture:** Mesmo padrão já usado em `clients-route.tsx`,
`orders-table.tsx` e nas telas da Fase 3a (`stock-route.tsx`,
`finance-route.tsx`, `quotes-route.tsx`): `PageHeader` para o cabeçalho,
grade de `Card size="sm"` para métricas, `Card` + `Table`/`TableRow` (com
cards mobile via `md:hidden` / `hidden md:block`) para listagens, `Badge`
com uma função `xxxVariant` por tipo de status, `Dialog`/`Input`/`Label`/
`Textarea` no modal de Películas. Mesa (kanban) reaproveita `Card` como
coluna e um `article` com borda como cartão de ordem — não existe ainda um
padrão de kanban no projeto, então esta fase o estabelece. Nenhuma mudança
de estado, fetch ou validação — só JSX e classes.

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind v4, shadcn/ui (já
instalado).

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md`
(Fase 3, subconjunto: mesa, películas, garantias, pós-venda).

## Pré-requisitos locais

- Configure `DATABASE_URL` para um PostgreSQL local isolado antes de executar
  `pnpm test`. Sem essa variável, os testes que usam banco são ignorados. O
  usuário local do banco precisa poder criar/remover bancos temporários
  `reparosm_test_*` e criar/conceder a role `reparosm_runtime` quando necessário
  (permissões `CREATEDB` e `CREATEROLE`, ou superusuário).
- Para `pnpm dev` e a checagem manual das telas, configure `DATABASE_URL` ou
  `NETLIFY_DB_URL`, um `ADMIN_PASSWORD_HASH` local válido e uma base local
  populada para percorrer os fluxos de cadastro, edição e exclusão. Não inclua
  valores de credenciais neste plano.

## Global Constraints

- Nenhuma prop, tipo exportado (`SaveOrder`, `SaveAfterSales`, `Contact`) ou
  lógica de `fetch`/validação muda — só a árvore JSX retornada por cada
  componente.
- Reaproveitar exatamente os padrões já em `components/clients-route.tsx`,
  `components/orders-table.tsx` e nos arquivos da Fase 3a (grade de métricas
  em `Card size="sm"`, `Card` + `CardHeader`/`CardTitle`/`CardDescription`/
  `CardContent`, `Badge variant={...}`, cards mobile + tabela desktop) — não
  inventar um padrão novo além do kanban da Task 1.
- Reaproveitar `orderPriorityVariant`, já exportado por
  `components/orders-table.tsx`, em vez de redeclarar a mesma função em
  `mesa-route.tsx`.
- Não introduzir primitivos shadcn que ainda não existem no projeto (ex.:
  `Tabs`, `Switch`). Onde o design antigo usava abas ou um switch, reaproveitar
  o padrão já existente: `Button variant={ativo ? 'default' : 'outline'}`
  para abas, e `Input type="checkbox"` + `Label` para alternância (mesmo
  padrão do "Publicar na vitrine" em `stock-route.tsx`).
- Depois de cada task, execute `pnpm format:check`, `pnpm lint` e
  `pnpm typecheck`; faça as verificações manuais descritas na própria task.
- Execute `pnpm test` e `pnpm build` uma vez, na suíte completa da Task 5.
  `tests/warranties-route.test.mjs` e `tests/warranty.test.mjs` não podem
  quebrar — são os únicos testes automatizados que já cobrem um dos arquivos
  desta fase.
- `pnpm exec graft build && pnpm exec graft check` ao final da fase.

## Review Focus

- Na Mesa, mover uma ordem com os botões ←/→ continua chamando `save` com a
  nova etapa e desabilitando o botão na primeira/última etapa — fácil de
  quebrar trocando os `<button>` nativos por `Button` shadcn sem preservar
  `disabled`, `onClick` e o `aria-label` dinâmico.
- Em Películas, o filtro "Minha loja" e o filtro por marca continuam
  mutuamente exclusivos (escolher um reseta o outro para o estado neutro) —
  reescrever a fileira de abas como botões shadcn não deve adicionar
  condições novas de "ativo" que não existiam no `className` original.
- Em Películas, "Adicionar à loja" (customizar um item do catálogo) deve
  continuar abrindo o modal com `draft` preenchido e `item` indefinido (para
  salvar como registro novo, não como edição) — o `Dialog` não deve receber
  `editing` no lugar de `draft`.
- Em Garantias, o valor numérico de cada métrica precisa continuar dentro de
  uma tag `<strong>` (não `<p>`), porque `tests/warranties-route.test.mjs` já
  usa uma regex (`/Garantia desconhecida[\s\S]*?<strong>(\d+)<\/strong>/`)
  que depende dessa marcação — não "padronizar" para `<p>` só por
  consistência visual com outras grades de métricas.
- Em Pós-venda, alternar uma automação precisa continuar enviando o mesmo
  `old?.id` (do registro já salvo) para `save`, e não criar um registro
  duplicado a cada clique — ao trocar o controle de alternância visual
  (antes um `<label className="switch">`, agora `Input type="checkbox"` +
  `Label`), o `onChange` precisa continuar chamando `toggle(item)` sem
  alterar sua assinatura.

---

### Task 1: Restilizar `components/mesa-route.tsx`

**Files:**

- Modify: `components/mesa-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/`CardContent`/`CardHeader`/`CardTitle`,
  `Badge`, `Button`, `EmptyState` (shadcn/local primitives);
  `orderPriorityVariant` de `components/orders-table.tsx`.
- Produces: nenhuma mudança de interface — `MesaRoute({ initialOrders,
defaultWarrantyDays? })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { OrderCreateModal, type SaveOrder } from '@/components/order-modals';
import { orderPriorityVariant } from '@/components/orders-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import type { Order, OrderStage } from '@/lib/types';
import { uploadOrderPhotos } from '@/lib/order-photo-upload';

type OrderRow = Order & { id: string };
const stages: OrderStage[] = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

export default function MesaRoute({
  initialOrders,
  defaultWarrantyDays = 90,
}: {
  initialOrders: OrderRow[];
  defaultWarrantyDays?: number;
}) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders);
  const [modal, setModal] = useState(false);
  const save: SaveOrder = async (data, id, photos = []) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Order };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível atualizar a ordem.');
      const saved = { id: result.record.id, ...result.record.data };
      if (!id && photos.length) {
        const uploaded = await uploadOrderPhotos(saved.id, photos);
        notify(
          uploaded === photos.length
            ? `OS criada com ${uploaded} foto(s) de prova.`
            : `OS criada; ${uploaded} de ${photos.length} foto(s) foram enviadas. Edite a OS para tentar novamente.`,
          uploaded === photos.length ? 'success' : 'error',
        );
      }
      setOrders((current) =>
        id ? current.map((order) => (order.id === id ? saved : order)) : [saved, ...current],
      );
      setModal(false);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível atualizar a ordem.',
        'error',
      );
    }
  };
  const move = (order: OrderRow, direction: number) => {
    const index = Math.max(
      0,
      Math.min(stages.length - 1, stages.indexOf(order.stage || 'Recebido') + direction),
    );
    void save({ ...order, stage: stages[index] }, order.id);
  };
  return (
    <>
      <PageHeader
        title="Mesa"
        description="Fluxo de atendimento carregado no servidor para a conta atual."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setModal(true)}>
              Nova ordem
            </Button>
          </div>
        }
      />
      {!orders.length ? (
        <EmptyState
          action={<Button onClick={() => setModal(true)}>Criar primeira ordem</Button>}
          description="Crie uma ordem para ela aparecer automaticamente no fluxo."
          title="A Mesa está vazia"
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const inStage = orders.filter((order) => (order.stage || 'Recebido') === stage);
            return (
              <Card className="w-72 shrink-0 gap-3" key={stage}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm">{stage}</CardTitle>
                  <Badge variant="secondary">{inStage.length}</Badge>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {inStage.length ? (
                    inStage.map((order) => (
                      <article className="grid gap-2 rounded-lg border p-3" key={order.id}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm">{order.code}</strong>
                          <Badge variant={orderPriorityVariant(order.priority)}>
                            {order.priority || 'Normal'}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{order.device}</p>
                        <p className="text-sm text-muted-foreground">{order.customer}</p>
                        <div className="flex items-center justify-between gap-2 border-t pt-2">
                          <Button
                            aria-label={`Voltar etapa de ${order.code}`}
                            disabled={stage === stages[0]}
                            onClick={() => move(order, -1)}
                            size="icon"
                            title="Voltar etapa"
                            type="button"
                            variant="outline"
                          >
                            ←
                          </Button>
                          <span className="text-sm font-medium tabular-nums">
                            {formatMoney(Number(order.total || 0))}
                          </span>
                          <Button
                            aria-label={`Avançar etapa de ${order.code}`}
                            disabled={stage === stages.at(-1)}
                            onClick={() => move(order, 1)}
                            size="icon"
                            title="Avançar etapa"
                            type="button"
                            variant="outline"
                          >
                            →
                          </Button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Nenhuma ordem
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {modal && (
        <OrderCreateModal
          close={() => setModal(false)}
          save={save}
          defaultWarrantyDays={defaultWarrantyDays}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/mesa` nos dois temas e em mobile (~375px) e desktop
(~1280px). Confirme: as colunas de etapa rolam horizontalmente em mobile,
cada cartão de ordem mostra código, prioridade, aparelho, cliente e total,
os botões ←/→ movem a ordem entre etapas e ficam desabilitados na primeira/
última etapa, e "Nova ordem" abre o modal de criação (com upload de fotos)
normalmente.

- [ ] **Step 4: Commit**

```bash
git add components/mesa-route.tsx
git commit -m "refactor: restyle mesa (kanban) route with shadcn"
```

---

### Task 2: Restilizar `components/films-route.tsx`

**Files:**

- Modify: `components/films-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/..., `Badge`, `Button`, `Dialog`/...,
  `EmptyState`, `Input`, `Label`, `Textarea` (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `FilmsRoute({ initialFilms })`
  continua igual; `FilmModal` continua um componente interno não exportado.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import type { Film } from '@/lib/types';

type FilmRow = Film & { id: string; editable: boolean };

export default function FilmsRoute({ initialFilms }: { initialFilms: FilmRow[] }) {
  const { notify } = useFeedback();
  const [films, setFilms] = useState(initialFilms);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('Todas');
  const [mineOnly, setMineOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<FilmRow | null>(null);
  const [draft, setDraft] = useState<Film | null>(null);
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const brands = [
    'Todas',
    ...Array.from(new Set(films.map((film) => film.brand).filter(Boolean))).sort(collator.compare),
  ];
  const found = films
    .filter(
      (film) =>
        (!mineOnly || film.editable) &&
        (brand === 'Todas' || film.brand === brand) &&
        `${film.brand} ${film.model} ${film.compatible}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (left, right) =>
        collator.compare(left.brand, right.brand) || collator.compare(left.model, right.model),
    );
  const hasShopFilms = films.some((film) => film.editable);
  const save = async (data: Film, id?: string) => {
    try {
      const response = await fetch('/api/films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, ...(id ? { id } : {}) }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Film };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a compatibilidade.');
      const saved = { id: result.record.id, ...result.record.data, editable: true };
      setFilms((current) =>
        id ? current.map((film) => (film.id === id ? saved : film)) : [saved, ...current],
      );
      setModal(false);
      setEditing(null);
      setDraft(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a compatibilidade.',
        'error',
      );
    }
  };
  const create = () => {
    setEditing(null);
    setDraft(null);
    setModal(true);
  };
  const edit = (film: FilmRow) => {
    setEditing(film);
    setDraft(null);
    setModal(true);
  };
  const customize = (film: FilmRow) => {
    setEditing(null);
    setDraft({
      brand: film.brand,
      model: film.model,
      compatible: film.compatible,
      size: film.size,
    });
    setModal(true);
  };
  const emptyTitle = !films.length
    ? 'Nenhuma compatibilidade cadastrada'
    : mineOnly && !hasShopFilms
      ? 'Sua loja ainda não tem itens editáveis'
      : 'Nenhum resultado encontrado';
  const emptyDescription = !films.length
    ? 'Cadastre equivalências entre modelos de celulares.'
    : mineOnly && !hasShopFilms
      ? 'Volte ao catálogo e use "Adicionar à loja" para criar sua primeira versão editável.'
      : 'Tente outro modelo ou marca.';
  return (
    <>
      <PageHeader
        title="Películas"
        description='Filtre "Minha loja" para editar seus itens; personalize os demais com "Adicionar à loja".'
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Nova compatibilidade
            </Button>
          </div>
        }
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Qual película serve neste aparelho?</CardTitle>
          <CardDescription>
            Catálogo organizado por marca e modelo em ordem numérica.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: A03, iPhone 13, Moto G54..."
            value={search}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setMineOnly((value) => !value);
                setBrand('Todas');
              }}
              size="sm"
              variant={mineOnly ? 'default' : 'outline'}
            >
              Minha loja ({films.filter((film) => film.editable).length})
            </Button>
            {brands.map((item) => (
              <Button
                key={item}
                onClick={() => {
                  setBrand(item);
                  setMineOnly(false);
                }}
                size="sm"
                variant={brand === item ? 'default' : 'outline'}
              >
                {item}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      {found.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {found.map((film) => {
            const customized = films.some(
              (own) => own.editable && own.brand === film.brand && own.model === film.model,
            );
            return (
              <Card key={film.id}>
                <CardContent className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{film.brand}</span>
                  <h3 className="font-semibold">{film.model}</h3>
                  <p className="text-sm text-muted-foreground">Também compatível com:</p>
                  <strong className="text-sm">{film.compatible}</strong>
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {film.size || 'Película frontal'}
                    </span>
                    {film.editable ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="success">Da loja</Badge>
                        <Button
                          aria-label={`Editar compatibilidade ${film.brand} ${film.model}`}
                          onClick={() => edit(film)}
                          size="sm"
                          variant="outline"
                        >
                          Editar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Catálogo</Badge>
                        {customized ? (
                          <Badge variant="success">Personalizada</Badge>
                        ) : (
                          <Button
                            aria-label={`Adicionar ${film.brand} ${film.model} à loja para editar`}
                            onClick={() => customize(film)}
                            size="sm"
                            variant="outline"
                          >
                            Adicionar à loja
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={<Button onClick={create}>Cadastrar compatibilidade</Button>}
          description={emptyDescription}
          title={emptyTitle}
        />
      )}
      {modal && (
        <FilmModal
          item={editing || undefined}
          initial={draft || undefined}
          close={() => {
            setModal(false);
            setEditing(null);
            setDraft(null);
          }}
          save={save}
        />
      )}
    </>
  );
}

function FilmModal({
  item,
  initial,
  close,
  save,
}: {
  item?: FilmRow;
  initial?: Film;
  close: () => void;
  save: (data: Film, id?: string) => Promise<void>;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void save(
              {
                brand: String(form.get('brand') || '').trim(),
                model: String(form.get('model') || '').trim(),
                compatible: String(form.get('compatible') || '').trim(),
                size: String(form.get('size') || '').trim(),
              },
              item?.id,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item
                ? 'Editar compatibilidade'
                : initial
                  ? 'Adicionar à minha loja'
                  : 'Nova compatibilidade'}
            </DialogTitle>
            <DialogDescription>
              {initial
                ? 'Revise os dados; esta versão poderá ser editada pela sua loja.'
                : 'Cadastre equivalências entre aparelhos.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="film-brand">Marca</Label>
            <Input
              defaultValue={item?.brand || initial?.brand || ''}
              id="film-brand"
              name="brand"
              placeholder="Ex.: Apple"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-model">Modelo principal</Label>
            <Input
              defaultValue={item?.model || initial?.model || ''}
              id="film-model"
              name="model"
              placeholder="Ex.: iPhone 13"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-compatible">Modelos compatíveis</Label>
            <Textarea
              defaultValue={item?.compatible || initial?.compatible || ''}
              id="film-compatible"
              name="compatible"
              placeholder="Ex.: iPhone 13 Pro, iPhone 14"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-size">Tamanho / observação</Label>
            <Input
              defaultValue={item?.size || initial?.size || ''}
              id="film-size"
              name="size"
              placeholder="Ex.: 6,1 polegadas"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button type="submit">
              {item
                ? 'Salvar alterações'
                : initial
                  ? 'Adicionar e editar na loja'
                  : 'Salvar compatibilidade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: o formulário do `FilmModal` continua não controlado (lê os campos via
`FormData` no `submit`, com `defaultValue` em vez de `value`/`onChange`) —
igual ao componente original. Não converter para estado controlado; isso
mudaria comportamento fora do escopo desta task.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/peliculas` nos dois temas e em mobile/desktop.
Confirme: busca filtra por marca/modelo/compatibilidade, o botão "Minha
loja" e os botões de marca continuam mutuamente exclusivos (clicar em um
desmarca visualmente o outro), "Adicionar à loja" abre o modal pré-
preenchido e salva como item novo (não sobrescreve o item do catálogo), e
"Editar" num item da própria loja abre o modal preenchido para edição.

- [ ] **Step 4: Commit**

```bash
git add components/films-route.tsx
git commit -m "refactor: restyle films route with shadcn"
```

---

### Task 3: Restilizar `components/warranties-route.tsx`

**Files:**

- Modify: `components/warranties-route.tsx`
- Test (não modificar; deve continuar passando sem alterações):
  `tests/warranties-route.test.mjs`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/..., `Table`/..., `Badge`, `Button`,
  `EmptyState`.
- Produces: nenhuma mudança de interface — `WarrantiesRoute({ orders,
defaultWarrantyDays })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Order } from '@/lib/types';
import { todayInSaoPaulo, warrantyPeriod } from '@/lib/warranty';

type OrderRow = Order & { id: string };
type WarrantyBadgeVariant = 'success' | 'warning' | 'destructive' | 'outline';

function warrantyBadgeVariant(status: string): WarrantyBadgeVariant {
  if (status === 'active') return 'success';
  if (status === 'expiring') return 'warning';
  if (status === 'expired') return 'destructive';
  return 'outline';
}

export default function WarrantiesRoute({
  orders,
  defaultWarrantyDays,
}: {
  orders: OrderRow[];
  defaultWarrantyDays: number;
}) {
  const today = todayInSaoPaulo();
  const covered = orders
    .filter(
      (order) =>
        order.stage === 'Retirada' || order.status === 'Concluído' || Boolean(order.deliveredAt),
    )
    .map((order) => ({
      ...order,
      period: warrantyPeriod(order.deliveredAt, order.warrantyDays, today),
    }));
  const active = covered.filter(
    (order) => order.period.status === 'active' || order.period.status === 'expiring',
  ).length;
  const expiring = covered.filter((order) => order.period.status === 'expiring').length;
  // Orders delivered before deliveredAt started being recorded have no valid date to
  // compute a warranty from; surfacing them separately explains why they are not
  // counted as active instead of silently under-reporting "Garantias ativas".
  const unknown = covered.filter((order) => order.period.status === 'unknown').length;
  const metrics = [
    { title: 'Garantias ativas', value: String(active), detail: 'Dentro do prazo' },
    { title: 'Vencem em breve', value: String(expiring), detail: 'Até 15 dias' },
    {
      title: 'Garantia desconhecida',
      value: String(unknown),
      detail: 'Sem data de entrega registrada',
    },
    {
      title: 'Retornos',
      value: String(orders.filter((order) => order.priority === 'Garantia').length),
      detail: 'Em atendimento',
    },
    {
      title: 'Prazo padrão',
      value: `${defaultWarrantyDays} dias`,
      detail: 'Novas ordens desta loja',
    },
  ];

  return (
    <>
      <PageHeader
        title="Garantias"
        description="Acompanhe o prazo de garantia das ordens já entregues."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Prazo por OS: <Link href="/ordens">Editar ordem</Link>. Padrão da loja:{' '}
        <Link href="/minha-assistencia">Minha assistência</Link>.
      </p>
      <section
        aria-label="Resumo de garantias"
        className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              {/* Value stays in a <strong> tag: tests/warranties-route.test.mjs
                  regexes for "<strong>(\d+)</strong>" right after the metric title. */}
              <strong className="text-2xl font-semibold tabular-nums">{metric.value}</strong>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {covered.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Ordens entregues</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {covered.map((order) => (
                <article className="grid gap-2 rounded-lg border p-4" key={order.id}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{order.code}</strong>
                    <Badge variant={warrantyBadgeVariant(order.period.status)}>
                      {statusLabel(order.period.status, order.deliveredAt)}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{order.customer}</p>
                  <p className="text-sm text-muted-foreground">{order.device}</p>
                  <p className="text-sm">{order.problem || order.service || '—'}</p>
                  <div className="grid grid-cols-2 gap-2 border-t pt-2 text-sm">
                    <p>
                      Entrega: <strong>{dateLabel(order.deliveredAt)}</strong>
                    </p>
                    <p>
                      Prazo:{' '}
                      <strong>
                        {order.warrantyDays ? `${order.warrantyDays} dias` : 'Pendente'}
                      </strong>
                    </p>
                    <p className="col-span-2">
                      Vencimento: <strong>{dateLabel(order.period.expiresAt)}</strong>
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aparelho</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {covered.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.code}</TableCell>
                      <TableCell>{order.customer}</TableCell>
                      <TableCell>{order.device}</TableCell>
                      <TableCell>{order.problem || order.service || '—'}</TableCell>
                      <TableCell>{dateLabel(order.deliveredAt)}</TableCell>
                      <TableCell>
                        {order.warrantyDays ? `${order.warrantyDays} dias` : 'Pendente'}
                      </TableCell>
                      <TableCell>{dateLabel(order.period.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge variant={warrantyBadgeVariant(order.period.status)}>
                          {statusLabel(order.period.status, order.deliveredAt)}
                        </Badge>
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
          description="Ao marcar a OS como retirada, o prazo de garantia aparecerá aqui."
          title="Nenhuma ordem entregue"
        />
      )}
    </>
  );
}

function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
    : 'Pendente';
}

function statusLabel(status: string, deliveredAt?: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'expiring') return 'Vencendo';
  if (status === 'expired') return 'Vencida';
  return deliveredAt ? 'Prazo pendente' : 'Data pendente';
}
```

- [ ] **Step 2: Rodar o teste existente**

Run: `npx tsx --import ./tests/support/setup.mjs --test tests/warranties-route.test.mjs`

Expected: os 2 testes continuam passando sem nenhuma alteração no arquivo de
teste (a marcação `<strong>` do Step 1 é o que garante isso).

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 4: Verificação manual**

Run: `pnpm dev`. Abra `/garantias` nos dois temas e em mobile/desktop.
Confirme: as 5 métricas aparecem corretas, cards mobile e tabela desktop
mostram as mesmas colunas de antes, e os badges de status usam cores
diferentes para Ativa (verde), Vencendo (âmbar), Vencida (vermelho) e
Prazo/Data pendente (neutro).

- [ ] **Step 5: Commit**

```bash
git add components/warranties-route.tsx
git commit -m "refactor: restyle warranties route with shadcn"
```

---

### Task 4: Restilizar `components/after-sales-route.tsx`

**Files:**

- Modify: `components/after-sales-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/..., `Table`/..., `Badge`, `Button`,
  `Input`, `Label`, `Select`/..., `Textarea`.
- Produces: nenhuma mudança de interface — `AfterSalesRoute({
initialAutomations, initialMessages, clients, orders, shop? })` continua
  igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
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
              <Select onValueChange={setTarget} value={target}>
                <SelectTrigger className="w-full" id="after-sales-target">
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
```

Note: o `Select` de "Cliente ou ordem" fica controlado por `target`, que
começa como string vazia. Como nenhum `SelectItem` usa valor vazio (o Radix
Select não aceita `value=""` num item), o próprio `SelectValue` mostra o
`placeholder` enquanto `target` não corresponder a nenhum contato — não é
necessário (nem válido) adicionar um item "Selecione..." na lista.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/pos-venda` nos dois temas e em mobile/desktop.
Confirme: selecionar um cliente/ordem e um modelo preenche a prévia da
mensagem, editar o texto manualmente substitui o modelo (e volta a usar o
modelo ao trocar de opção), "Abrir no WhatsApp" abre a conversa (com contato
válido) e registra uma mensagem no histórico, alternar uma automação
(checkbox) atualiza o texto do rótulo ("Ativar lembrete" ↔ "Ativa para a
API") sem duplicar o cartão, e o histórico mostra cards em mobile e tabela
em desktop.

- [ ] **Step 4: Commit**

```bash
git add components/after-sales-route.tsx
git commit -m "refactor: restyle after-sales route with shadcn"
```

---

### Task 5: Fechamento da fase

**Files:**

- Inspect: todos os arquivos tocados nas Tasks 1-4
- Inspect and modify: `app/globals.css` (somente seletores exclusivos das
  telas 3b)

- [ ] **Step 1: Limpeza de CSS legado**

Inspecione `app/globals.css` e procure, com `rg`, os seletores usados pelas
telas migradas nas Tasks 1-4 (`.kanban`, `.kanban-enhanced`, `.film-search`,
`.film-brand-tabs`, `.film-grid`, `.after-hero`, `.whatsapp-compose`,
`.wa-title`, `.wa-preview`, `.whatsapp-btn`, `.automation-grid`, `.switch`,
`.wa-history`, entre outros). Remova apenas regras exclusivas de Mesa,
Películas e Pós-venda que deixaram de ter consumidores. Preserve seletores
compartilhados (por exemplo, `.row-actions`, `.empty-state`, `.badge`,
`.topbar`, `.metrics`/`.metric`, `.panel`/`.page-panel`, `.table-scroll`) e
regras usadas pelas telas da Fase 3c; `app/globals.css` só será esvaziado ao
final da Fase 4.

- [ ] **Step 2: Suíte completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde (nenhum teste de negócio deveria ter sido afetado — é
refatoração puramente visual). Confirme que os pré-requisitos locais estão
configurados para que os testes de banco não sejam ignorados.

- [ ] **Step 3: Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [ ] **Step 4: Checagem visual final**

Run: `pnpm dev`. Percorra `/mesa`, `/peliculas`, `/garantias` e
`/pos-venda` nos dois temas e em mobile (~375px) e desktop (~1280px).
Confirme ausência de estilos legados destoando do restante do painel.

- [ ] **Step 5: Commit da limpeza de CSS**

```bash
git add app/globals.css
git commit -m "refactor: remove migrated screen styles (phase 3b)"
```

- [ ] **Step 6: Push e PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: redesign mesa, films, warranties and after-sales screens" --body "Fase 3b do redesenho visual: migra Mesa (kanban), Películas, Garantias e Pós-venda para Tailwind v4 + shadcn/ui. Nenhuma regra de negócio muda."
```

Aguarde o CI passar antes de mesclar.
