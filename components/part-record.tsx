'use client';

import Link from 'next/link';
import { ListOrdered } from 'lucide-react';
import { PartForm, type PartRow, type SavePart } from '@/components/part-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RecordDialog, { RecordField, RecordSection } from '@/components/ui/record-dialog';
import { toneText } from '@/components/ui/tone';
import { formatMoney } from '@/lib/format';
import { badgeFor, stockTone } from '@/lib/status-tones';

const LOW_STOCK = 4;

/** Ficha do produto: abre para ver; "Editar" troca para o formulário na mesma janela. */
export default function PartRecordDialog({
  part,
  close,
  save,
  startEditing = false,
}: {
  part: PartRow;
  close: () => void;
  save: SavePart;
  startEditing?: boolean;
}) {
  const price = Number(part.price || 0);
  const cost = Number(part.cost || 0);
  const margin = price - cost;
  const marginPercent = price > 0 ? Math.round((margin / price) * 1000) / 10 : null;
  const tone = stockTone(part.stock, LOW_STOCK);
  return (
    <RecordDialog
      actions={
        <Button asChild variant="outline">
          <Link href="/estoque?view=kardex">
            <ListOrdered aria-hidden="true" />
            Ver movimentações
          </Link>
        </Button>
      }
      badge={
        <Badge variant={badgeFor(tone)}>
          {part.stock <= 0
            ? 'Sem estoque'
            : part.stock <= LOW_STOCK
              ? 'Estoque baixo'
              : 'Disponível'}
        </Badge>
      }
      close={close}
      description={[part.category, part.sku].filter(Boolean).join(' · ') || 'Sem categoria'}
      editLabel="Editar produto"
      renderEdit={(controls) => (
        <PartForm
          item={part}
          markDirty={controls.markDirty}
          onCancel={controls.cancel}
          onSaved={controls.saved}
          save={save}
        />
      )}
      startEditing={startEditing}
      title={part.name}
    >
      <div className="grid gap-6">
        <RecordSection
          className="rounded-lg border bg-muted/30 p-4"
          columns={3}
          title="Estoque e valores"
        >
          <RecordField label="Em estoque">
            <strong className={`text-lg tabular-nums ${toneText[tone]}`}>
              {part.stock} {Math.abs(part.stock) === 1 ? 'unidade' : 'unidades'}
            </strong>
          </RecordField>
          <RecordField label="Preço de venda">
            <strong className="text-lg tabular-nums">{formatMoney(price)}</strong>
          </RecordField>
          <RecordField label="Custo unitário">{formatMoney(cost)}</RecordField>
          <RecordField label="Margem por unidade">
            <span className={margin < 0 ? toneText.danger : undefined}>
              {formatMoney(margin)}
              {marginPercent !== null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({marginPercent.toLocaleString('pt-BR')}%)
                </span>
              )}
            </span>
          </RecordField>
          <RecordField label="Valor parado no estoque">
            {formatMoney(Math.max(0, part.stock) * cost)}
          </RecordField>
        </RecordSection>
        <RecordSection title="Cadastro">
          <RecordField label="Categoria">{part.category || 'Sem categoria'}</RecordField>
          <RecordField label="Código / SKU">{part.sku || 'Não informado'}</RecordField>
          <RecordField label="Vitrine online">
            {part.published ? 'Publicado na vitrine' : 'Fora da vitrine'}
          </RecordField>
        </RecordSection>
      </div>
    </RecordDialog>
  );
}
