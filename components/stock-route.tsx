'use client';

import Link from 'next/link';
import { useState } from 'react';
import PartModal, { type PartRow, type SavePart } from '@/components/part-modal';
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
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o produto.');
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
    if (!confirm(`Excluir definitivamente o produto ${part.name}?`)) return;
    try {
      const response = await fetch(`/api/parts?id=${encodeURIComponent(part.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o produto.');
      setParts((current) => current.filter((item) => item.id !== part.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir o produto.');
    }
  };
  const togglePublished = (part: PartRow, published: boolean) => {
    void save({ ...part, published }, part.id).catch(() => undefined);
  };
  const storeUrl = `/vitrine?loja=${encodeURIComponent(accountId)}`;
  const copyStore = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${storeUrl}`);
      alert('Link da vitrine copiado!');
    } catch {
      alert('Não foi possível copiar o link da vitrine.');
    }
  };
  const openStore = () => window.open(storeUrl, '_blank', 'noopener,noreferrer');
  const title = initialView === 'inventory' ? 'Estoque' : 'Peças & Vitrine';
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>{title}</h1>
          <small>Produtos e estoque carregados no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
          <Link
            className="top-action-link"
            href={initialView === 'inventory' ? '/estoque?view=catalog' : '/estoque?view=inventory'}
          >
            {initialView === 'inventory' ? 'Peças & Vitrine' : 'Estoque'}
          </Link>
          <button className="primary" type="button" onClick={create}>
            + Adicionar produto
          </button>
        </div>
      </header>
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
  return (
    <>
      <article className="showcase-banner">
        <div>
          <span>VITRINE ONLINE</span>
          <h2>Minha vitrine de produtos</h2>
          <p>{published.length} produtos publicados</p>
          <code>{`/vitrine?loja=${encodeURIComponent(accountId)}`}</code>
        </div>
        <div className="showcase-actions">
          <button type="button" onClick={onOpenStore}>
            Abrir vitrine ↗
          </button>
          <button type="button" onClick={onCopyStore}>
            Copiar link
          </button>
        </div>
      </article>
      {items.length ? (
        <div className="catalog-grid">
          {items.map((part) => (
            <article key={part.id}>
              <div className="part-art">
                {part.category === 'Capinhas'
                  ? '▣'
                  : part.category === 'Carregadores'
                    ? '⌁'
                    : part.category === 'Acessórios'
                      ? '◇'
                      : '⚙'}
              </div>
              <span>{part.category}</span>
              <h3>{part.name}</h3>
              <p>{part.stock} unidades</p>
              <strong>{formatMoney(part.price)}</strong>
              <footer>
                <label>
                  <input
                    type="checkbox"
                    checked={part.published === true}
                    onChange={(event) => onTogglePublished(part, event.target.checked)}
                  />{' '}
                  Publicar na vitrine
                </label>
                <div className="row-actions">
                  <button type="button" onClick={() => onEdit(part)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => onRemove(part)}>
                    Excluir
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum produto cadastrado"
          text="Adicione peças, carregadores, capinhas, acessórios ou qualquer produto da sua loja."
          action="Adicionar produto"
          onAction={onCreate}
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
  return (
    <>
      <div className="metrics">
        <Metric
          title="Itens em estoque"
          value={String(items.reduce((sum, part) => sum + part.stock, 0))}
          detail="Unidades disponíveis"
        />
        <Metric title="Valor investido" value={formatMoney(total)} detail="Baseado no custo" />
        <Metric
          title="Estoque baixo"
          value={String(items.filter((part) => part.stock < 5).length)}
          detail="Produtos com menos de 5"
        />
        <Metric title="Produtos cadastrados" value={String(items.length)} detail="Todos os tipos" />
      </div>
      {items.length ? (
        <article className="panel page-panel inventory-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Categoria</th>
                  <th>Quantidade</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  <th>Margem</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((part) => (
                  <tr key={part.id}>
                    <td>
                      <b>{part.name}</b>
                    </td>
                    <td>{part.category || '—'}</td>
                    <td>{part.stock} un.</td>
                    <td>{formatMoney(part.cost)}</td>
                    <td>{formatMoney(part.price)}</td>
                    <td>{formatMoney(Number(part.price) - Number(part.cost || 0))}</td>
                    <td>
                      <span className={`tag ${part.stock < 5 ? 'red' : 'ready'}`}>
                        {part.stock < 5 ? 'Estoque baixo' : 'Disponível'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => onEdit(part)}>
                          Editar
                        </button>
                        <button type="button" onClick={() => onRemove(part)}>
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
        <EmptyState
          title="Estoque vazio"
          text="Cadastre sua primeira peça para controlar quantidade, custo, venda e margem."
          action="Adicionar peça"
          onAction={onCreate}
        />
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

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <article className="empty-state">
      <div>✦</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" type="button" onClick={onAction}>
        {action}
      </button>
    </article>
  );
}
