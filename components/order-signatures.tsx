'use client';

import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { cn } from 'cn';
import { useFeedback } from '@/components/feedback';
import SignatureDialog, { type SignableOrder } from '@/components/signature-dialog';
import { Button } from '@/components/ui/button';
import { toneText } from '@/components/ui/tone';
import {
  signatureLabels,
  signatureRoles,
  signedAtLabel,
  type OrderSignature,
  type SignatureRole,
} from '@/lib/order-signatures';

const shortLabels: Record<SignatureRole, string> = { customer: 'Cliente', shop: 'Assistência' };

/**
 * As duas assinaturas da OS (cliente e assistência): quem assinou e quando, se a
 * OS mudou depois, e o botão para assinar na tela. Na prévia da impressão,
 * recarrega a página ao assinar para o documento já sair assinado.
 */
export default function OrderSignatures({
  order,
  shopSigner = '',
  initialSignatures,
  initialTerms,
  reloadOnChange = false,
  className,
}: {
  order: SignableOrder;
  /** Nome sugerido para a assinatura da assistência (técnico da OS ou da loja). */
  shopSigner?: string;
  /** Vem do servidor na impressão; na ficha, é buscado ao abrir. */
  initialSignatures?: OrderSignature[];
  initialTerms?: string;
  reloadOnChange?: boolean;
  className?: string;
}) {
  const { notify, confirm } = useFeedback();
  const [signatures, setSignatures] = useState<OrderSignature[] | null>(initialSignatures ?? null);
  const [terms, setTerms] = useState(initialTerms);
  const [signing, setSigning] = useState<SignatureRole | null>(null);
  const endpoint = `/api/orders/${encodeURIComponent(order.id)}/signatures`;

  useEffect(() => {
    if (initialSignatures) return;
    let active = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { signatures?: OrderSignature[]; terms?: string } | null) => {
        if (!active || !result) return;
        setSignatures(result.signatures ?? []);
        setTerms(result.terms || undefined);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [endpoint, initialSignatures]);

  const changed = (next: OrderSignature[]) => {
    setSignatures(next);
    // Na prévia da impressão, o documento é montado no servidor: recarrega com a assinatura.
    if (reloadOnChange) window.location.reload();
  };

  const remove = async (role: SignatureRole) => {
    if (
      !(await confirm(
        `Remover a ${signatureLabels[role].toLowerCase()}? A linha volta a sair em branco.`,
      ))
    )
      return;
    try {
      const response = await fetch(`${endpoint}?papel=${role}`, { method: 'DELETE' });
      const result = (await response.json()) as { signatures?: OrderSignature[]; error?: string };
      if (!response.ok || !result.signatures)
        throw new Error(result.error || 'Não foi possível remover a assinatura.');
      changed(result.signatures);
      notify('Assinatura removida.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível remover a assinatura.',
        'error',
      );
    }
  };

  return (
    <section aria-labelledby={`signatures-${order.id}`} className={cn('grid gap-3', className)}>
      <div>
        <h3 id={`signatures-${order.id}`} className="font-semibold">
          Assinaturas
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Assine no tablet ou no celular e a impressão já sai assinada. Sem assinatura, a linha sai
          em branco para assinar no papel.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {signatureRoles.map((role) => {
          const signature = signatures?.find((item) => item.role === role);
          return (
            <li className="grid content-start gap-2 rounded-lg border bg-card p-3" key={role}>
              <p className="text-sm font-medium">{shortLabels[role]}</p>
              {signature ? (
                <>
                  {/* Assinatura colhida na tela (PNG validado no servidor). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`${signatureLabels[role]} de ${signature.signerName}`}
                    className="h-14 w-full rounded bg-white object-contain"
                    src={signature.image}
                  />
                  <p className="text-xs text-muted-foreground">
                    {signature.signerName}, {signedAtLabel(signature.signedAt)}
                  </p>
                  {signature.changed.length > 0 && (
                    <p className={cn('text-xs', toneText.warning)}>
                      Mudou depois de assinar: {signature.changed.join(', ')}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {signatures ? 'Ainda não assinada.' : 'Carregando…'}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!signatures}
                  onClick={() => setSigning(role)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PenLine aria-hidden="true" />
                  {signature ? 'Assinar de novo' : 'Assinar na tela'}
                </Button>
                {signature && (
                  <Button onClick={() => void remove(role)} size="sm" type="button" variant="ghost">
                    Remover
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {signing && (
        <SignatureDialog
          close={() => setSigning(null)}
          defaultName={signing === 'customer' ? order.customer : shopSigner}
          onSaved={changed}
          order={order}
          role={signing}
          terms={terms}
        />
      )}
    </section>
  );
}
