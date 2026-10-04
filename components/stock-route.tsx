'use client';

import { useState } from 'react';
import PartModal, { type PartRow, type SavePart } from '@/components/part-modal';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import RowMenu from '@/components/ui/row-menu';
import Segmented from '@/components/ui/segmented';
import SoftBanner from '@/components/ui/soft-banner';
import StatCard from '@/components/ui/stat-card';
import { toneText } from '@/components/ui/tone';
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  Link2,
  Package,
  Plus,
  Store,
  Wallet,
} from 'lucide-react';
import { badgeFor, stockTone } from '@/lib/status-tones';
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

const LOW_STOCK = 4;
const stockLabel = (stock: number) =>
  stock <= 0 ? 'Sem estoque' : stock <= LOW_STOCK ? 'Estoque baixo' : 'Disponível';
const StockBadge = ({ stock }: { stock: number }) => (
  <Badge className="w-fit" variant={badgeFor(stockTone(stock, LOW_STOCK))}>
    {stockLabel(stock)}
  </Badge>
);

/** Editar à vista; excluir fica no menu. */
function PartActions({
  part,
  onEdit,
  onRemove,
}: {
  part: PartRow;
  onEdit: (part: PartRow) => void;
  onRemove: (part: PartRow) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button onClick={() => onEdit(part)} size="sm" variant="outline">
        Editar
      </Button>
      <RowMenu label={part.name}>
        <DropdownMenuItem onSelect={() => onRemove(part)} variant="destructive">
          Excluir
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}

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
  const title = 'Estoque e vitrine';
  return (
    <>
      <PageHeader
        title={title}
        description="Seus produtos, quanto tem de cada um e o que aparece na vitrine online."
        action={
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Adicionar produto
          </Button>
        }
      />
      <Segmented
        className="mb-4"
        label="Visão dos produtos"
        options={[
          { value: 'catalog', label: 'Vitrine', icon: Store, href: '/estoque?view=catalog' },
          { value: 'inventory', label: 'Estoque', icon: Boxes, href: '/estoque?view=inventory' },
        ]}
        value={initialView === 'inventory' ? 'inventory' : 'catalog'}
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
      <SoftBanner
        action={
          <>
            <Button onClick={onOpenStore} size="sm" variant="outline">
              <ExternalLink aria-hidden="true" />
              Abrir vitrine
            </Button>
            <Button onClick={onCopyStore} size="sm" variant="outline">
              <Link2 aria-hidden="true" />
              Copiar link
            </Button>
          </>
        }
        className="mb-4"
        description={
          <>
            {published.length}{' '}
            {published.length === 1 ? 'produto publicado' : 'produtos publicados'} ·{' '}
            <code className="text-xs">{storeUrl}</code>
          </>
        }
        icon={Store}
        title="Sua vitrine online"
      />
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((part) => (
            <Card key={part.id}>
              <CardContent className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {part.category || 'Sem categoria'}
                </span>
                <h3 className="font-semibold">{part.name}</h3>
                <p className={`text-sm ${toneText[stockTone(part.stock, LOW_STOCK)]}`}>
                  {part.stock <= 0
                    ? 'Sem estoque'
                    : `${part.stock} ${part.stock === 1 ? 'unidade' : 'unidades'}`}
                </p>
                <strong className="text-lg">{formatMoney(part.price)}</strong>
                <div className="flex items-center gap-2 border-t pt-3">
                  <Input
                    checked={part.published === true}
                    className="size-4 shrink-0"
                    id={`part-published-${part.id}`}
                    onChange={(event) => onTogglePublished(part, event.target.checked)}
                    type="checkbox"
                  />
                  <label className="flex-1 text-sm" htmlFor={`part-published-${part.id}`}>
                    Na vitrine
                  </label>
                  <PartActions onEdit={onEdit} onRemove={onRemove} part={part} />
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
  const low = items.filter((part) => part.stock <= LOW_STOCK).length;
  return (
    <>
      <section
        aria-label="Resumo de estoque"
        className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <StatCard
          detail="Unidades disponíveis"
          icon={Package}
          label="Itens em estoque"
          value={items.reduce((sum, part) => sum + part.stock, 0)}
        />
        <StatCard
          detail="Pelo custo"
          icon={Wallet}
          label="Valor investido"
          tone="info"
          value={formatMoney(total)}
        />
        <StatCard
          detail={`Com ${LOW_STOCK} unidades ou menos`}
          icon={AlertTriangle}
          label="Estoque baixo"
          tone="warning"
          value={low}
          valueTone={low ? 'warning' : undefined}
        />
        <StatCard detail="Todos os tipos" icon={Boxes} label="Produtos" value={items.length} />
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
                  <div className="flex items-center justify-between gap-2">
                    <StockBadge stock={part.stock} />
                    <PartActions onEdit={onEdit} onRemove={onRemove} part={part} />
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
                        <StockBadge stock={part.stock} />
                      </TableCell>
                      <TableCell>
                        <PartActions onEdit={onEdit} onRemove={onRemove} part={part} />
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
