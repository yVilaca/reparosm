'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useFeedback } from '@/components/feedback';
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

type FieldChange = ChangeEvent<HTMLInputElement | HTMLSelectElement>;
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
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>◇</span>
            <div>
              <h2>{editing ? 'Editar produto' : 'Adicionar produto'}</h2>
              <p>Estoque geral e vitrine online</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome do produto *
          <input
            value={form.name}
            onChange={field('name')}
            required
            placeholder="Ex.: Carregador USB-C 20W"
          />
        </label>
        <div className="form-row">
          <label>
            Categoria
            <select value={form.category} onChange={field('category')}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
              <option>Outra</option>
            </select>
          </label>
          <label>
            Código / SKU
            <input value={form.sku} onChange={field('sku')} placeholder="Opcional" />
          </label>
        </div>
        {form.category === 'Outra' && (
          <label>
            Nome da categoria *
            <input
              value={form.customCategory}
              onChange={field('customCategory')}
              required
              placeholder="Digite sua categoria"
            />
          </label>
        )}
        <div className="form-row">
          <label>
            Quantidade em estoque
            <input
              value={form.stock}
              onChange={field('stock')}
              type="number"
              min="0"
              step="1"
              required
            />
          </label>
          <label>
            Custo unitário
            <input
              value={form.cost}
              onChange={field('cost')}
              type="number"
              min="0"
              step="0.01"
              required
            />
          </label>
        </div>
        <label>
          Preço de venda
          <input
            value={form.price}
            onChange={field('price')}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label className="check">
          <input
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            type="checkbox"
          />{' '}
          Publicar na vitrine online
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar produto'}
          </button>
        </div>
      </form>
    </div>
  );
}
