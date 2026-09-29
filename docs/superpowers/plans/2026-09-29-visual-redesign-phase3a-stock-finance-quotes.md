# Redesenho visual — Fase 3a: Estoque, Financeiro e Orçamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Estoque (catálogo + inventário), Financeiro e Orçamentos — e seus
modais — do CSS legado para os primitivos shadcn já estabelecidos nas Fases 1-2,
sem alterar nenhuma regra de negócio.

**Architecture:** Mesmo padrão já usado em `clients-route.tsx`/`orders-table.tsx`:
`PageHeader` para o cabeçalho, grade de `Card size="sm"` para métricas, `Card` +
`Table`/`TableRow` para listagens, `Badge` com uma função `xxxVariant` por tipo de
status, `Dialog`/`Input`/`Label`/`Select`/`Textarea` nos modais. Nenhuma mudança de
estado, fetch ou validação — só JSX e classes.

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind v4, shadcn/ui (já instalado).

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md` (Fase 3,
subconjunto: estoque, financeiro, orçamentos).

## Global Constraints

- Nenhuma prop, tipo exportado (`SavePart`, `SaveMoney`, `SaveQuote`, `PartRow`,
  `MoneyRow`, `QuoteRow`) ou lógica de `fetch`/validação muda — só a árvore JSX
  retornada por cada componente.
- Reaproveitar exatamente os padrões já em `components/clients-route.tsx` e
  `components/orders-table.tsx` (grade de métricas em `Card size="sm"`, `Card` +
  `CardHeader`/`CardTitle`/`CardDescription`/`CardContent` para a listagem
  principal, `Badge variant={...}` para status) — não inventar um padrão novo.
- Ao final de cada task: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test` e `pnpm build` devem passar.
- `pnpm exec graft build && pnpm exec graft check` ao final da fase.

## Review Focus

- Publicar/despublicar um produto na vitrine (`Catalog`'s checkbox) continua
  chamando `onTogglePublished` e refletindo o novo estado sem recarregar a
  página — fácil de quebrar trocando o `<input type="checkbox">` por um
  componente shadcn `Checkbox` que não existe no projeto ainda (não introduzir).
- O link da vitrine/orçamento copiado (`navigator.clipboard.writeText`)
  continua funcionando — não mexer nos handlers, só no botão que os dispara.
- A visualização mobile de cada lista (cards) e desktop (tabela) continuam
  as DUAS existindo — o padrão do projeto é renderizar ambas e esconder uma via
  CSS responsivo do próprio shadcn `Table`/`Card`, não remover uma delas.
- Trocar a categoria para "Outra" em `part-modal.tsx` continua revelando o
  campo de categoria customizada condicionalmente.
- O rascunho do formulário em cada modal de edição continua vindo do `item`
  passado por prop (`formFrom(item)`) — não resetar para valores vazios ao
  reabrir para editar.

---

### Task 1: Restilizar `components/part-modal.tsx`

**Files:**

- Modify: `components/part-modal.tsx`

**Interfaces:**

- Consumes: `Dialog`, `Input`, `Label`, `Select`, `Button` (shadcn).
- Produces: nenhuma mudança de interface — `PartModal({ item?, close, save })`
  continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Part } from '@/lib/types';

export type PartRow = Part & { id: string };
export type SavePart = (data: Part, id?: string) => Promise<void>;

const categories = [
  'Telas',
  'Baterias',
  'Conectores',
  'Peças e componentes',
  'Carregadores',
  'Cabos',
  'Capinhas',
  'Películas',
  'Fones de ouvido',
  'Acessórios',
  'Celulares',
  'Smartwatches',
];

type FieldChange = ChangeEvent<HTMLInputElement>;
type PartForm = {
  name: string;
  category: string;
  customCategory: string;
  sku: string;
  stock: string;
  cost: string;
  price: string;
};

const formFrom = (item?: PartRow): PartForm => ({
  name: item?.name || '',
  category: item?.category && categories.includes(item.category) ? item.category : 'Outra',
  customCategory: item?.category && !categories.includes(item.category) ? item.category : '',
  sku: item?.sku || '',
  stock: item ? String(item.stock) : '',
  cost: item?.cost === undefined ? '' : String(item.cost),
  price: item ? String(item.price) : '',
});

export default function PartModal({
  item,
  close,
  save,
}: {
  item?: PartRow;
  close: () => void;
  save: SavePart;
}) {
  const { notify } = useFeedback();
  const [form, setForm] = useState(() => formFrom(item));
  const [published, setPublished] = useState(item?.published ?? true);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof PartForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const category = form.category === 'Outra' ? form.customCategory.trim() : form.category;
    if (!category) {
      notify('Informe uma categoria.', 'error');
      return;
    }
    setSaving(true);
    try {
      await save(
        {
          name: form.name.trim(),
          category,
          stock: Number(form.stock),
          cost: Number(form.cost),
          price: Number(form.price),
          sku: form.sku.trim(),
          published,
          ...(item?.image !== undefined ? { image: item.image } : {}),
        },
        item?.id,
      );
    } finally {
      setSaving(false);
    }
  };
  const editing = Boolean(item);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar produto' : 'Adicionar produto'}</DialogTitle>
            <DialogDescription>Estoque geral e vitrine online.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="part-name">Nome do produto *</Label>
            <Input
              id="part-name"
              onChange={field('name')}
              placeholder="Ex.: Carregador USB-C 20W"
              required
              value={form.name}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="part-category">Categoria</Label>
              <Select
                onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}
                value={form.category}
              >
                <SelectTrigger id="part-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                  <SelectItem value="Outra">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="part-sku">Código / SKU</Label>
              <Input id="part-sku" onChange={field('sku')} placeholder="Opcional" value={form.sku} />
            </div>
          </div>
          {form.category === 'Outra' && (
            <div className="grid gap-2">
              <Label htmlFor="part-custom-category">Nome da categoria *</Label>
              <Input
                id="part-custom-category"
                onChange={field('customCategory')}
                placeholder="Digite sua categoria"
                required
                value={form.customCategory}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="part-stock">Quantidade em estoque</Label>
              <Input
                id="part-stock"
                min="0"
                onChange={field('stock')}
                required
                step="1"
                type="number"
                value={form.stock}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="part-cost">Custo unitário</Label>
              <Input
                id="part-cost"
                min="0"
                onChange={field('cost')}
                required
                step="0.01"
                type="number"
                value={form.cost}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="part-price">Preço de venda</Label>
            <Input
              id="part-price"
              min="0"
              onChange={field('price')}
              required
              step="0.01"
              type="number"
              value={form.price}
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              checked={published}
              className="size-4 shrink-0"
              id="part-published"
              onChange={(event) => setPublished(event.target.checked)}
              type="checkbox"
            />
            <Label className="font-normal" htmlFor="part-published">
              Publicar na vitrine online
            </Label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar produto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0. (`stock-route.tsx` ainda importa o `PartModal` antigo por
tipo — a Task 2 atualiza o consumidor; typecheck já deve passar porque a
assinatura pública não mudou.)

- [ ] **Step 3: Commit**

```bash
git add components/part-modal.tsx
git commit -m "refactor: restyle part modal with shadcn"
```

---

### Task 2: Restilizar `components/stock-route.tsx`

**Files:**

- Modify: `components/stock-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/`CardContent`/`CardHeader`/`CardTitle`,
  `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow`, `Badge`,
  `Button`, `EmptyState` (shadcn/local primitives).
- Produces: nenhuma mudança de interface — `StockRoute({ accountId,
  initialParts, initialView })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import PartModal, { type PartRow, type SavePart } from '@/components/part-modal';
import { useFeedback } from '@/components/feedback';
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
import { formatMoney } from '@/lib/format';
import type { Part } from '@/lib/types';

type StockView = 'catalog' | 'inventory';

export default function StockRoute({
  accountId,
  initialParts,
  initialView,
}: {
  accountId: string;
  initialParts: PartRow[];
  initialView: StockView;
}) {
  const { notify, confirm } = useFeedback();
  const [parts, setParts] = useState(initialParts);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<PartRow | null>(null);
  const save: SavePart = async (data: Part, id?: string) => {
    try {
      const response = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Part };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o produto.');
      const saved = { id: result.record.id, ...result.record.data };
      setParts((current) =>
        id ? current.map((part) => (part.id === id ? saved : part)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o produto.',
        'error',
      );
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (part: PartRow) => {
    setEditing(part);
    setModal('edit');
  };
  const remove = async (part: PartRow) => {
    if (!(await confirm(`Excluir definitivamente o produto ${part.name}?`))) return;
    try {
      const response = await fetch(`/api/parts?id=${encodeURIComponent(part.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o produto.');
      setParts((current) => current.filter((item) => item.id !== part.id));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o produto.',
        'error',
      );
    }
  };
  const togglePublished = (part: PartRow, published: boolean) => {
    void save({ ...part, published }, part.id).catch(() => undefined);
  };
  const storeUrl = `/vitrine?loja=${encodeURIComponent(accountId)}`;
  const copyStore = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${storeUrl}`);
      notify('Link da vitrine copiado.', 'success');
    } catch {
      notify('Não foi possível copiar o link da vitrine.', 'error');
    }
  };
  const openStore = () => window.open(storeUrl, '_blank', 'noopener,noreferrer');
  const title = initialView === 'inventory' ? 'Estoque' : 'Peças & Vitrine';

  return (
    <>
      <PageHeader
        title={title}
        description="Produtos e estoque carregados no servidor para a conta atual."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link
                href={
                  initialView === 'inventory' ? '/estoque?view=catalog' : '/estoque?view=inventory'
                }
              >
                {initialView === 'inventory' ? 'Peças & Vitrine' : 'Estoque'}
              </Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Adicionar produto
            </Button>
          </div>
        }
      />
      {initialView === 'inventory' ? (
        <Inventory items={parts} onCreate={create} onEdit={edit} onRemove={remove} />
      ) : (
        <Catalog
          accountId={accountId}
          items={parts}
          onCreate={create}
          onEdit={edit}
          onRemove={remove}
          onCopyStore={copyStore}
          onOpenStore={openStore}
          onTogglePublished={togglePublished}
        />
      )}
      {modal === 'create' && <PartModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <PartModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}

function Catalog({
  accountId,
  items,
  onCreate,
  onEdit,
  onRemove,
  onCopyStore,
  onOpenStore,
  onTogglePublished,
}: {
  accountId: string;
  items: PartRow[];
  onCreate: () => void;
  onEdit: (part: PartRow) => void;
  onRemove: (part: PartRow) => void;
  onCopyStore: () => void;
  onOpenStore: () => void;
  onTogglePublished: (part: PartRow, published: boolean) => void;
}) {
  const published = items.filter((part) => part.published);
  const storeUrl = `/vitrine?loja=${encodeURIComponent(accountId)}`;
  return (
    <>
      <Card className="mb-4 gap-3 bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Vitrine online
            </p>
            <h2 className="text-lg font-semibold">Minha vitrine de produtos</h2>
            <p className="text-sm opacity-90">{published.length} produtos publicados</p>
            <code className="text-xs opacity-80">{storeUrl}</code>
          </div>
          <div className="flex gap-2">
            <Button onClick={onOpenStore} size="sm" variant="secondary">
              Abrir vitrine ↗
            </Button>
            <Button onClick={onCopyStore} size="sm" variant="secondary">
              Copiar link
            </Button>
          </div>
        </CardContent>
      </Card>
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((part) => (
            <Card key={part.id}>
              <CardContent className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">{part.category}</span>
                <h3 className="font-semibold">{part.name}</h3>
                <p className="text-sm text-muted-foreground">{part.stock} unidades</p>
                <strong className="text-lg">{formatMoney(part.price)}</strong>
                <div className="flex items-center gap-2 border-t pt-3">
                  <Input
                    checked={part.published === true}
                    className="size-4 shrink-0"
                    id={`part-published-${part.id}`}
                    onChange={(event) => onTogglePublished(part, event.target.checked)}
                    type="checkbox"
                  />
                  <label className="text-sm" htmlFor={`part-published-${part.id}`}>
                    Publicar na vitrine
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => onEdit(part)} size="sm" variant="outline">
                    Editar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => onRemove(part)}
                    size="sm"
                    variant="destructive"
                  >
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Adicione peças, carregadores, capinhas, acessórios ou qualquer produto da sua loja."
          action={<Button onClick={onCreate}>Adicionar produto</Button>}
        />
      )}
    </>
  );
}

function Inventory({
  items,
  onCreate,
  onEdit,
  onRemove,
}: {
  items: PartRow[];
  onCreate: () => void;
  onEdit: (part: PartRow) => void;
  onRemove: (part: PartRow) => void;
}) {
  const total = items.reduce(
    (sum, part) => sum + Number(part.stock || 0) * Number(part.cost || 0),
    0,
  );
  const metrics = [
    {
      title: 'Itens em estoque',
      value: String(items.reduce((sum, part) => sum + part.stock, 0)),
      detail: 'Unidades disponíveis',
    },
    { title: 'Valor investido', value: formatMoney(total), detail: 'Baseado no custo' },
    {
      title: 'Estoque baixo',
      value: String(items.filter((part) => part.stock < 5).length),
      detail: 'Produtos com menos de 5',
    },
    { title: 'Produtos cadastrados', value: String(items.length), detail: 'Todos os tipos' },
  ];
  return (
    <>
      <section aria-label="Resumo de estoque" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      {items.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventário</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peça</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead>Margem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-medium">{part.name}</TableCell>
                    <TableCell>{part.category || '—'}</TableCell>
                    <TableCell>{part.stock} un.</TableCell>
                    <TableCell>{formatMoney(part.cost)}</TableCell>
                    <TableCell>{formatMoney(part.price)}</TableCell>
                    <TableCell>{formatMoney(Number(part.price) - Number(part.cost || 0))}</TableCell>
                    <TableCell>
                      <Badge variant={part.stock < 5 ? 'destructive' : 'success'}>
                        {part.stock < 5 ? 'Estoque baixo' : 'Disponível'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button onClick={() => onEdit(part)} size="sm" variant="outline">
                          Editar
                        </Button>
                        <Button onClick={() => onRemove(part)} size="sm" variant="destructive">
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Estoque vazio"
          description="Cadastre sua primeira peça para controlar quantidade, custo, venda e margem."
          action={<Button onClick={onCreate}>Adicionar peça</Button>}
        />
      )}
    </>
  );
}
```

Note: `Input` usado como checkbox (`type="checkbox"`) segue o mesmo padrão já
usado em `order-modals.tsx` (Fase 1/2) para o consentimento de WhatsApp — não é
uma invenção nova desta task.

- [ ] **Step 2: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/estoque` (catálogo) e `/estoque?view=inventory`, nos
dois temas e em mobile (~375px). Confirme: cartões de produto no catálogo,
tabela no inventário, o toggle "Publicar na vitrine" continua funcionando
(marque/desmarque e recarregue a página para confirmar persistência), os
botões "Abrir vitrine"/"Copiar link" funcionam, e os modais de criar/editar
produto abrem corretamente.

- [ ] **Step 4: Commit**

```bash
git add components/stock-route.tsx
git commit -m "refactor: restyle stock route (catalog and inventory) with shadcn"
```

---

### Task 3: Restilizar `components/money-modal.tsx`

**Files:**

- Modify: `components/money-modal.tsx`

**Interfaces:**

- Consumes: `Dialog`, `Input`, `Label`, `Select`, `Button` (shadcn).
- Produces: nenhuma mudança de interface — `MoneyModal({ kind, item?, close,
  save })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Expense, Payment } from '@/lib/types';

export type MoneyKind = 'payment' | 'expense';
export type MoneyData = Payment | Expense;
export type MoneyRow = MoneyData & { id: string; kind: MoneyKind };
export type SaveMoney = (kind: MoneyKind, data: MoneyData, id?: string) => Promise<void>;

const methods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto'];

type FieldChange = ChangeEvent<HTMLInputElement>;
type MoneyForm = {
  description: string;
  reference: string;
  method: string;
  date: string;
  value: string;
};

const formFrom = (item?: MoneyRow): MoneyForm => ({
  description: item?.description || '',
  reference: item?.reference || '',
  method: item?.method || 'Pix',
  date: item?.date || new Date().toISOString().slice(0, 10),
  value: item?.value === undefined ? '' : String(item.value),
});

export default function MoneyModal({
  kind,
  item,
  close,
  save,
}: {
  kind: MoneyKind;
  item?: MoneyRow;
  close: () => void;
  save: SaveMoney;
}) {
  const receive = kind === 'payment';
  const [form, setForm] = useState(() => formFrom(item));
  const [saving, setSaving] = useState(false);
  const field = (key: keyof MoneyForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await save(
        kind,
        {
          description: form.description.trim(),
          reference: form.reference.trim(),
          method: form.method,
          date: form.date,
          value: Number(form.value),
          ...(item
            ? { createdAt: item.createdAt, updatedAt: new Date().toISOString() }
            : { createdAt: new Date().toISOString() }),
        },
        item?.id,
      );
    } finally {
      setSaving(false);
    }
  };
  const editing = Boolean(item);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? 'Editar lançamento'
                : receive
                  ? 'Registrar recebimento'
                  : 'Registrar despesa'}
            </DialogTitle>
            <DialogDescription>Lançamento no controle financeiro.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="money-description">Descrição *</Label>
            <Input
              id="money-description"
              onChange={field('description')}
              placeholder={receive ? 'Ex.: Pagamento OS-1024' : 'Ex.: Compra de componentes'}
              required
              value={form.description}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="money-reference">Referência</Label>
            <Input
              id="money-reference"
              onChange={field('reference')}
              placeholder="OS, cliente, fornecedor ou documento"
              value={form.reference}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="money-method">Forma</Label>
              <Select
                onValueChange={(value) => setForm((current) => ({ ...current, method: value }))}
                value={form.method}
              >
                <SelectTrigger id="money-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="money-date">Data</Label>
              <Input id="money-date" onChange={field('date')} required type="date" value={form.date} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="money-value">Valor *</Label>
            <Input
              id="money-value"
              min="0.01"
              onChange={field('value')}
              required
              step="0.01"
              type="number"
              value={form.value}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : 'Salvar lançamento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Commit**

```bash
git add components/money-modal.tsx
git commit -m "refactor: restyle money modal with shadcn"
```

---

### Task 4: Restilizar `components/finance-route.tsx`

**Files:**

- Modify: `components/finance-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/`CardContent`/`CardHeader`/`CardTitle`,
  `Table`/..., `Badge`, `Button`, `EmptyState`.
- Produces: nenhuma mudança de interface — `FinanceRoute({ initialPayments,
  initialExpenses })` continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import MoneyModal, {
  type MoneyData,
  type MoneyKind,
  type MoneyRow,
  type SaveMoney,
} from '@/components/money-modal';
import { useFeedback } from '@/components/feedback';
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
import { formatMoney } from '@/lib/format';
import type { Expense, Payment } from '@/lib/types';

export default function FinanceRoute({
  initialPayments,
  initialExpenses,
}: {
  initialPayments: Array<Payment & { id: string }>;
  initialExpenses: Array<Expense & { id: string }>;
}) {
  const { notify, confirm } = useFeedback();
  const [rows, setRows] = useState<MoneyRow[]>([
    ...initialPayments.map((data) => ({ ...data, kind: 'payment' as const })),
    ...initialExpenses.map((data) => ({ ...data, kind: 'expense' as const })),
  ]);
  const [modal, setModal] = useState<MoneyKind | null>(null);
  const [editing, setEditing] = useState<MoneyRow | null>(null);
  const save: SaveMoney = async (kind: MoneyKind, data: MoneyData, id?: string) => {
    try {
      const resource = kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: MoneyData };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o lançamento.');
      const saved = { id: result.record.id, ...result.record.data, kind } as MoneyRow;
      setRows((current) =>
        id ? current.map((row) => (row.id === id ? saved : row)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.',
        'error',
      );
      throw error;
    }
  };
  const create = (kind: MoneyKind) => {
    setEditing(null);
    setModal(kind);
  };
  const edit = (row: MoneyRow) => {
    setEditing(row);
    setModal(row.kind);
  };
  const remove = async (row: MoneyRow) => {
    if (!(await confirm(`Excluir definitivamente o lançamento ${row.description}?`))) return;
    try {
      const resource = row.kind === 'payment' ? 'payments' : 'expenses';
      const response = await fetch(`/api/${resource}?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o lançamento.');
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o lançamento.',
        'error',
      );
    }
  };
  const payments = rows.filter((row) => row.kind === 'payment');
  const expenses = rows.filter((row) => row.kind === 'expense');
  const income = payments.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const out = expenses.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const sorted = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const metrics = [
    { title: 'Recebimentos', value: formatMoney(income), detail: 'Entradas registradas' },
    { title: 'Despesas', value: formatMoney(out), detail: 'Saídas registradas' },
    { title: 'Resultado', value: formatMoney(income - out), detail: 'Receita menos despesas' },
    { title: 'Lançamentos', value: String(rows.length), detail: 'No histórico financeiro' },
  ];

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Recebimentos e despesas carregados no servidor."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => create('expense')}
              variant="outline"
            >
              Despesa
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => create('payment')}>
              Recebimento
            </Button>
          </div>
        }
      />

      <section aria-label="Resumo financeiro" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      {sorted.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Histórico financeiro</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={row.kind === 'payment' ? 'success' : 'destructive'}>
                        {row.kind === 'payment' ? 'Receita' : 'Despesa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{row.description}</p>
                      {row.reference && (
                        <p className="text-xs text-muted-foreground">{row.reference}</p>
                      )}
                    </TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell
                      className={
                        row.kind === 'expense'
                          ? 'font-medium text-destructive'
                          : 'font-medium text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {row.kind === 'expense' ? '- ' : '+ '}
                      {formatMoney(row.value)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button onClick={() => edit(row)} size="sm" variant="outline">
                          Editar
                        </Button>
                        <Button onClick={() => remove(row)} size="sm" variant="destructive">
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Financeiro sem movimentações"
          description="Registre um recebimento ou despesa para iniciar o controle do caixa."
        />
      )}
      {modal && (
        <MoneyModal
          kind={modal}
          item={editing || undefined}
          close={() => setModal(null)}
          save={save}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/pagamentos` nos dois temas e em mobile. Confirme:
métricas corretas, tabela com badges Receita/Despesa coloridos, criar um
recebimento e uma despesa, editar e excluir um lançamento.

- [ ] **Step 4: Commit**

```bash
git add components/finance-route.tsx
git commit -m "refactor: restyle finance route with shadcn"
```

---

### Task 5: Restilizar `components/quote-modal.tsx`

**Files:**

- Modify: `components/quote-modal.tsx`

**Interfaces:**

- Consumes: `Dialog`, `Input`, `Label`, `Textarea`, `Button` (shadcn).
- Produces: nenhuma mudança de interface — `QuoteModal({ item?, close, save })`
  continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/format';
import type { Quote } from '@/lib/types';

export type QuoteRow = Quote & { id: string };
export type SaveQuote = (data: Quote, id?: string) => Promise<void>;

type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type QuoteForm = {
  code: string;
  customer: string;
  phone: string;
  device: string;
  problem: string;
  service: string;
  notes: string;
  validUntil: string;
};

const formFrom = (item?: QuoteRow): QuoteForm => ({
  code: item?.code || '',
  customer: item?.customer || '',
  phone: item?.phone || '',
  device: item?.device || '',
  problem: item?.problem || '',
  service: item?.service || '',
  notes: item?.notes || '',
  validUntil: item?.validUntil || '',
});

export default function QuoteModal({
  item,
  close,
  save,
}: {
  item?: QuoteRow;
  close: () => void;
  save: SaveQuote;
}) {
  const [form, setForm] = useState(() => formFrom(item));
  const [labor, setLabor] = useState(() => Number(item?.labor || 0));
  const [parts, setParts] = useState(() => Number(item?.parts || 0));
  const [saving, setSaving] = useState(false);
  const field = (key: keyof QuoteForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await save(
        {
          ...form,
          code: form.code || `ORC-${Date.now().toString().slice(-5)}`,
          labor,
          parts,
          total: labor + parts,
          status: item?.status || 'Aguardando',
          ...(item ? { updatedAt: now } : { createdAt: now }),
        },
        item?.id,
      );
    } finally {
      setSaving(false);
    }
  };
  const editing = Boolean(item);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl p-0">
        <form
          className="grid max-h-[90dvh] gap-6 overflow-y-auto p-6"
          onSubmit={submit}
        >
          <DialogHeader>
            <DialogTitle>{editing ? `Editar orçamento ${item?.code}` : 'Novo orçamento'}</DialogTitle>
            <DialogDescription>Gere um link para aprovação do cliente.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-customer">Cliente *</Label>
              <Input
                id="quote-customer"
                onChange={field('customer')}
                required
                value={form.customer}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-phone">WhatsApp *</Label>
              <Input
                id="quote-phone"
                onChange={field('phone')}
                placeholder="(DDD) número"
                required
                value={form.phone}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-device">Celular *</Label>
            <Input
              id="quote-device"
              onChange={field('device')}
              placeholder="Marca e modelo"
              required
              value={form.device}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-problem">Problema relatado *</Label>
            <Textarea
              id="quote-problem"
              onChange={field('problem')}
              placeholder="Ex.: Aparelho não liga e não carrega"
              required
              value={form.problem}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-service">Serviço proposto *</Label>
            <Textarea
              id="quote-service"
              onChange={field('service')}
              placeholder="Descreva o diagnóstico e o que será realizado"
              required
              value={form.service}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-notes">Observações para o cliente</Label>
            <Textarea
              id="quote-notes"
              onChange={field('notes')}
              placeholder="Condições, prazo, qualidade da peça, garantia ou recomendações"
              value={form.notes}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-labor">Mão de obra</Label>
              <Input
                id="quote-labor"
                min="0"
                onChange={(event) => setLabor(Number(event.target.value))}
                step="0.01"
                type="number"
                value={labor}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-parts">Peças</Label>
              <Input
                id="quote-parts"
                min="0"
                onChange={(event) => setParts(Number(event.target.value))}
                step="0.01"
                type="number"
                value={parts}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="quote-valid-until">Válido até</Label>
            <Input
              id="quote-valid-until"
              onChange={field('validUntil')}
              type="date"
              value={form.validUntil}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total do orçamento</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(labor + parts)}</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar e gerar link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`

Expected: código 0.

- [ ] **Step 3: Commit**

```bash
git add components/quote-modal.tsx
git commit -m "refactor: restyle quote modal with shadcn"
```

---

### Task 6: Restilizar `components/quotes-route.tsx`

**Files:**

- Modify: `components/quotes-route.tsx`

**Interfaces:**

- Consumes: `PageHeader`, `Card`/..., `Table`/..., `Badge`, `Button`,
  `EmptyState`.
- Produces: nenhuma mudança de interface — `QuotesRoute({ initialQuotes })`
  continua igual.

- [ ] **Step 1: Reescrever o componente**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import QuoteModal, { type QuoteRow, type SaveQuote } from '@/components/quote-modal';
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
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Quote } from '@/lib/types';

function quoteStatusVariant(status: string | undefined): 'success' | 'destructive' | 'secondary' {
  if (status === 'Aprovado') return 'success';
  if (status === 'Recusado') return 'destructive';
  return 'secondary';
}

export default function QuotesRoute({ initialQuotes }: { initialQuotes: QuoteRow[] }) {
  const { notify, confirm } = useFeedback();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<QuoteRow | null>(null);
  const save: SaveQuote = async (data: Quote, id?: string) => {
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Quote };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar o orçamento.');
      const saved = { id: result.record.id, ...result.record.data };
      setQuotes((current) =>
        id ? current.map((quote) => (quote.id === id ? saved : quote)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o orçamento.',
        'error',
      );
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (quote: QuoteRow) => {
    setEditing(quote);
    setModal('edit');
  };
  const remove = async (quote: QuoteRow) => {
    if (!(await confirm(`Excluir definitivamente o orçamento ${quote.code || quote.id}?`))) return;
    try {
      const response = await fetch(`/api/quotes?id=${encodeURIComponent(quote.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o orçamento.');
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível excluir o orçamento.',
        'error',
      );
    }
  };
  const link = (quote: QuoteRow) => `${window.location.origin}/o/${encodeURIComponent(quote.id)}`;
  const copy = async (quote: QuoteRow) => {
    try {
      await navigator.clipboard.writeText(link(quote));
      notify('Link do orçamento copiado.', 'success');
    } catch {
      notify('Não foi possível copiar o link do orçamento.', 'error');
    }
  };
  const send = (quote: QuoteRow) => {
    const message = `Olá, ${quote.customer}! Seu orçamento ${quote.code} para ${quote.device} está pronto. Visualize, aprove ou recuse aqui: ${link(quote)}`;
    if (!hasValidWhatsapp(quote.phone)) {
      notify('Cadastre um WhatsApp válido no orçamento.', 'error');
      return;
    }
    window.open(whatsappUrl(quote.phone, message), '_blank', 'noopener,noreferrer');
  };
  const actions = (quote: QuoteRow) => (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => window.open(link(quote), '_blank', 'noopener,noreferrer')}
        size="sm"
        variant="outline"
      >
        Abrir
      </Button>
      <Button onClick={() => edit(quote)} size="sm" variant="outline">
        Editar
      </Button>
      <Button onClick={() => copy(quote)} size="sm" variant="outline">
        Copiar link
      </Button>
      <Button onClick={() => send(quote)} size="sm" variant="outline">
        WhatsApp
      </Button>
      <Button onClick={() => remove(quote)} size="sm" variant="destructive">
        Excluir
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Crie propostas e acompanhe a decisão do cliente."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Novo orçamento
            </Button>
          </div>
        }
      />
      {quotes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{quotes.length} orçamentos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Problema</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.code || '—'}</TableCell>
                    <TableCell>{quote.customer}</TableCell>
                    <TableCell>{quote.device}</TableCell>
                    <TableCell>{quote.problem || quote.service || '—'}</TableCell>
                    <TableCell>{formatMoney(quote.total)}</TableCell>
                    <TableCell>
                      <Badge variant={quoteStatusVariant(quote.status)}>
                        {quote.status || 'Aguardando'}
                      </Badge>
                    </TableCell>
                    <TableCell>{actions(quote)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Nenhum orçamento"
          description="Crie um orçamento detalhado e compartilhe o link com o cliente."
          action={<Button onClick={create}>Criar orçamento</Button>}
        />
      )}
      {modal === 'create' && <QuoteModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <QuoteModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 3: Verificação manual**

Run: `pnpm dev`. Abra `/orcamentos` nos dois temas e em mobile. Confirme:
badges de status coloridos, criar/editar orçamento, copiar link, abrir o link
público (`/o/[id]`), enviar por WhatsApp (se telefone válido), excluir.

- [ ] **Step 4: Commit**

```bash
git add components/quotes-route.tsx
git commit -m "refactor: restyle quotes route with shadcn"
```

---

### Task 7: Fechamento da fase

**Files:**

- Inspect: todos os arquivos tocados nas Tasks 1-6

- [ ] **Step 1: Suíte completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde (nenhum teste de negócio deveria ter sido afetado — é
refatoração puramente visual).

- [ ] **Step 2: Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [ ] **Step 3: Checagem visual final**

Run: `pnpm dev`. Percorra `/estoque`, `/estoque?view=inventory`,
`/pagamentos` e `/orcamentos` nos dois temas e em duas larguras, confirmando
que não sobrou CSS legado (Arial, cores antigas) destoando do restante do
painel já migrado.

- [ ] **Step 4: Push e PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: redesign stock, finance and quotes screens" --body "Fase 3a do redesenho visual: migra Estoque (catálogo + inventário), Financeiro e Orçamentos, e seus modais, para Tailwind v4 + shadcn/ui. Nenhuma regra de negócio muda."
```

Aguarde o CI passar antes de mesclar.
