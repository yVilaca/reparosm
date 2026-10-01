'use client';

import Link from 'next/link';
import { useState } from 'react';
import PartModal, { type PartRow, type SavePart } from '@/components/part-modal';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
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
      notify(id ? 'Produto atualizado.' : 'Produto adicionado.', 'success');
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
      notify('Produto excluído.', 'success');
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
                  <Button
                    className="flex-1"
                    onClick={() => onEdit(part)}
                    size="sm"
                    variant="outline"
                  >
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
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:hidden">
              {items.map((part) => (
                <article className="grid gap-3 rounded-lg border p-4" key={part.id}>
                  <div>
                    <h3 className="font-semibold">{part.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {part.category || 'Sem categoria'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p>
                      Quantidade: <strong>{part.stock} un.</strong>
                    </p>
                    <p>
                      Custo: <strong>{formatMoney(part.cost)}</strong>
                    </p>
                    <p>
                      Venda: <strong>{formatMoney(part.price)}</strong>
                    </p>
                    <p>
                      Margem:{' '}
                      <strong>{formatMoney(Number(part.price) - Number(part.cost || 0))}</strong>
                    </p>
                  </div>
                  <Badge className="w-fit" variant={part.stock < 5 ? 'destructive' : 'success'}>
                    {part.stock < 5 ? 'Estoque baixo' : 'Disponível'}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => onEdit(part)}
                      size="sm"
                      variant="outline"
                    >
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
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
                      <TableCell>
                        {formatMoney(Number(part.price) - Number(part.cost || 0))}
                      </TableCell>
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
            </div>
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
