'use client';

import { useState, type ChangeEvent } from 'react';
import { useFeedback } from '@/components/feedback';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecordForm } from '@/components/ui/record-dialog';
import { MaskedInput } from '@/components/ui/masked-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Part } from '@/lib/types';
import { parseMoney } from '@/lib/quick-sale';

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

/** Campos do produto. Usado na ficha (Editar) e na janela de produto novo. */
export function PartForm({
  item,
  save,
  onCancel,
  onSaved,
  markDirty,
}: {
  item?: PartRow;
  save: SavePart;
  onCancel: () => void;
  onSaved: () => void;
  markDirty?: () => void;
}) {
  const { notify } = useFeedback();
  const [form, setForm] = useState(() => formFrom(item));
  const [published, setPublished] = useState(item?.published ?? true);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof PartForm) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async () => {
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
          cost: parseMoney(form.cost),
          price: parseMoney(form.price),
          sku: form.sku.trim(),
          published,
          ...(item?.image !== undefined ? { image: item.image } : {}),
        },
        item?.id,
      );
      onSaved();
    } catch {
      // A tela já avisou o motivo; o formulário continua aberto para corrigir.
    } finally {
      setSaving(false);
    }
  };
  return (
    <RecordForm
      markDirty={markDirty}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      submitLabel={item ? 'Salvar alterações' : 'Salvar produto'}
    >
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
            onValueChange={(value) => {
              // O seletor não dispara o "change" do formulário: marca aqui.
              markDirty?.();
              setForm((current) => ({ ...current, category: value }));
            }}
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
          <MaskedInput
            mask={item && item.stock < 0 ? 'signed-integer' : 'integer'}
            id="part-stock"
            min={item && item.stock < 0 ? String(item.stock) : '0'}
            onChange={field('stock')}
            required
            value={form.stock}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="part-cost">Custo unitário</Label>
          <MaskedInput
            mask="currency"
            id="part-cost"
            onChange={field('cost')}
            required
            value={form.cost}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="part-price">Preço de venda</Label>
        <MaskedInput
          mask="currency"
          id="part-price"
          onChange={field('price')}
          required
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
    </RecordForm>
  );
}

/** Janela de produto novo. Para ver e editar um existente, use a ficha (PartRecordDialog). */
export default function PartModal({ close, save }: { close: () => void; save: SavePart }) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Adicionar produto</DialogTitle>
          <DialogDescription>Estoque geral e vitrine online.</DialogDescription>
        </DialogHeader>
        <PartForm onCancel={close} onSaved={close} save={save} />
      </DialogContent>
    </Dialog>
  );
}
