import { signedAtLabel, type OrderSignature } from '@/lib/order-signatures';

/** "Assinado na tela em 19/10/2026 às 14:32", e se a OS mudou depois. */
export function signatureNote(signature: OrderSignature) {
  const when = `Assinado na tela em ${signedAtLabel(signature.signedAt)}`;
  return signature.changed.length
    ? `${when}, antes de mudanças em: ${signature.changed.join(', ')}.`
    : `${when}.`;
}

/**
 * Linha de assinatura da impressão. Com assinatura colhida na tela, a imagem vai
 * sobre a linha; sem ela, a linha sai em branco para assinar no papel.
 */
export default function PrintSignature({
  label,
  name,
  signature,
  compact = false,
}: {
  label: string;
  /** Quem deve assinar (o nome de quem assinou, quando já assinado). */
  name: string;
  signature?: OrderSignature;
  compact?: boolean;
}) {
  const image = signature && (
    // Assinatura colhida na tela (PNG validado no servidor), embutida no documento.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${label} de ${signature.signerName}`}
      className={compact ? 'compact-signature-image' : 'mx-auto h-16 max-w-full object-contain'}
      src={signature.image}
    />
  );
  if (compact)
    return (
      <div>
        {image}
        <span className="compact-signature-line">{label}</span>
        <p>{signature?.signerName || name}</p>
        {signature && <p className="compact-signature-note">{signatureNote(signature)}</p>}
      </div>
    );
  return (
    <div className="grid content-end gap-1 text-center">
      {image ?? <div aria-hidden="true" className="h-16" />}
      <div className="border-t pt-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{signature?.signerName || name}</p>
        {signature && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {signatureNote(signature)}
          </p>
        )}
      </div>
    </div>
  );
}
