'use client';

import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** O que o formulário de edição recebe da ficha. */
export type RecordEditControls = {
  /** Volta para a ficha (pede confirmação se houver alteração não salva). */
  cancel: () => void;
  /** Chame depois de salvar: a ficha volta a ser exibida, já atualizada. */
  saved: () => void;
  /** Avise na primeira alteração, para não perder o que foi digitado ao sair. */
  markDirty: () => void;
};

/**
 * Ficha de um registro: abre para ver e só vira formulário quando a pessoa
 * clica em "Editar", na mesma janela. Sair com alteração não salva pede
 * confirmação.
 */
export default function RecordDialog({
  title,
  description,
  badge,
  className = 'max-w-2xl',
  close,
  startEditing = false,
  canEdit = true,
  editLabel = 'Editar',
  actions,
  primary,
  renderEdit,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Situação do registro, ao lado do título (ex.: etapa, status). */
  badge?: ReactNode;
  /** Largura da janela. */
  className?: string;
  close: () => void;
  /** Abre direto no formulário (ex.: "Editar" no menu da linha). */
  startEditing?: boolean;
  canEdit?: boolean;
  editLabel?: string;
  /** Ações da ficha à esquerda do "Editar" (imprimir, copiar link...). */
  actions?: ReactNode;
  /** Ação principal da ficha, à direita do "Editar" (receber, cobrar...). */
  primary?: ReactNode;
  /** O formulário: corpo e rodapé (Cancelar / Salvar). */
  renderEdit: (controls: RecordEditControls) => ReactNode;
  /** O corpo da ficha. */
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(startEditing && canEdit);
  const [dirty, setDirty] = useState(false);
  // De onde veio o pedido de sair do formulário com alterações: fechar ou cancelar.
  const [leaving, setLeaving] = useState<'close' | 'cancel' | null>(null);

  const leaveEditing = () => {
    setEditing(false);
    setDirty(false);
    setLeaving(null);
  };
  const discard = () => (leaving === 'close' ? close() : leaveEditing());
  const controls: RecordEditControls = {
    cancel: () => (dirty ? setLeaving('cancel') : leaveEditing()),
    saved: leaveEditing,
    markDirty: () => setDirty(true),
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        if (editing && dirty) setLeaving('close');
        else close();
      }}
    >
      <DialogContent
        className={cn('flex flex-col gap-0 overflow-hidden p-0', className)}
        // Sem descrição, avisa o Radix que não há texto descritivo de propósito.
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {editing ? (
              <Badge variant="info">
                <Pencil aria-hidden="true" />
                Editando
              </Badge>
            ) : (
              badge
            )}
          </div>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {editing ? (
          <div className="flex min-h-0 flex-1 flex-col">{renderEdit(controls)}</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              {children}
            </div>
            <DialogFooter className="shrink-0 flex-wrap border-t bg-background p-4">
              {actions}
              {canEdit && (
                <Button onClick={() => setEditing(true)} variant="outline">
                  <Pencil aria-hidden="true" />
                  {editLabel}
                </Button>
              )}
              {primary}
            </DialogFooter>
          </>
        )}

        {leaving && (
          <div
            aria-label="Descartar alterações"
            className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background p-4 shadow-[0_-12px_24px_-16px_rgb(0_0_0/0.35)]"
            role="alertdialog"
          >
            <p className="text-sm font-medium">Descartar as alterações que você fez?</p>
            <div className="flex gap-2">
              <Button autoFocus onClick={() => setLeaving(null)} variant="outline">
                Continuar editando
              </Button>
              <Button onClick={discard} variant="destructive">
                Descartar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Um dado da ficha: rótulo pequeno e valor. */
export function RecordField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

/** Um bloco da ficha, com título e os dados em grade. */
export function RecordSection({
  title,
  children,
  columns = 2,
  className,
}: {
  title: string;
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('grid gap-3', className)}>
      <h3 className="font-semibold">{title}</h3>
      <dl
        className={cn(
          'grid gap-4',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-3',
        )}
      >
        {children}
      </dl>
    </section>
  );
}

/**
 * Formulário padrão das fichas: campos com rolagem e rodapé fixo com
 * Cancelar e Salvar. Serve tanto dentro da ficha (Editar) quanto na janela
 * de cadastro novo.
 */
export function RecordForm({
  onSubmit,
  onCancel,
  markDirty,
  saving,
  submitLabel,
  footer,
  children,
}: {
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  /** Chamado em qualquer alteração de campo. */
  markDirty?: () => void;
  saving: boolean;
  submitLabel: string;
  /** Resumo à esquerda do rodapé (ex.: total). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onChange={markDirty}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
        {children}
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{footer}</div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button disabled={saving} onClick={onCancel} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Salvando…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
