'use client';

import { useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import SignaturePad, { type SignaturePadHandle } from '@/components/signature-pad';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import {
  signatureDeclarations,
  signatureLabels,
  SIGNER_NAME_LIMIT,
  type OrderSignature,
  type SignatureRole,
} from '@/lib/order-signatures';

/** O que a pessoa vê da OS antes de assinar. */
export type SignableOrder = {
  id: string;
  code: string;
  customer: string;
  device: string;
  problem?: string;
  service?: string;
  total?: number;
};

/**
 * Janela de assinatura na tela: o que está sendo assinado, a declaração, o nome
 * e a área para assinar com dedo, mouse ou caneta.
 */
export default function SignatureDialog({
  order,
  role,
  terms,
  defaultName,
  close,
  onSaved,
}: {
  order: SignableOrder;
  role: SignatureRole;
  terms?: string;
  defaultName: string;
  close: () => void;
  onSaved: (signatures: OrderSignature[]) => void;
}) {
  const { notify } = useFeedback();
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultName);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const total = Number(order.total || 0);

  const confirm = async () => {
    const image = pad.current?.toPng();
    if (!image || !name.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, signerName: name.trim(), image }),
      });
      const result = (await response.json()) as { signatures?: OrderSignature[]; error?: string };
      if (!response.ok || !result.signatures)
        throw new Error(result.error || 'Não foi possível salvar a assinatura.');
      onSaved(result.signatures);
      notify('Assinatura salva. A impressão já sai assinada.', 'success');
      close();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a assinatura.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{signatureLabels[role]}</DialogTitle>
          <DialogDescription>
            {order.code}, {order.device}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Cliente</dt>
          <dd>{order.customer}</dd>
          <dt className="text-muted-foreground">Aparelho</dt>
          <dd>{order.device}</dd>
          {order.problem && (
            <>
              <dt className="text-muted-foreground">Problema relatado</dt>
              <dd>{order.problem}</dd>
            </>
          )}
          {order.service && (
            <>
              <dt className="text-muted-foreground">Serviço</dt>
              <dd>{order.service}</dd>
            </>
          )}
          {total > 0 && (
            <>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </>
          )}
        </dl>

        {terms && (
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Ler os termos da assistência</summary>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line text-muted-foreground">
              {terms}
            </p>
          </details>
        )}

        <p className="text-sm">{signatureDeclarations[role]}</p>

        <div className="grid gap-2">
          <Label htmlFor="signature-name">Nome de quem assina</Label>
          <Input
            autoComplete="off"
            id="signature-name"
            maxLength={SIGNER_NAME_LIMIT}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Assine com o dedo ou a caneta</p>
            <div className="flex gap-1">
              <Button
                disabled={saving}
                onClick={() => pad.current?.undo()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Undo2 aria-hidden="true" />
                Desfazer
              </Button>
              <Button
                disabled={saving}
                onClick={() => pad.current?.clear()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Eraser aria-hidden="true" />
                Limpar
              </Button>
            </div>
          </div>
          <SignaturePad
            className="h-52 sm:h-60"
            label={signatureLabels[role]}
            onInkChange={setHasInk}
            ref={pad}
          />
        </div>

        <DialogFooter>
          <Button disabled={saving} onClick={close} type="button" variant="outline">
            Cancelar
          </Button>
          <Button
            disabled={!hasInk || !name.trim() || saving}
            onClick={() => void confirm()}
            type="button"
          >
            {saving ? 'Salvando…' : 'Confirmar assinatura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
