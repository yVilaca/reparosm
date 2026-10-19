/** Quem assina a OS: as mesmas duas linhas da impressão. */
export const signatureRoles = ['customer', 'shop'] as const;
export type SignatureRole = (typeof signatureRoles)[number];

export const MAX_SIGNATURE_BYTES = 256 * 1024;
export const SIGNER_NAME_LIMIT = 120;

export const signatureLabels: Record<SignatureRole, string> = {
  customer: 'Assinatura do cliente',
  shop: 'Assinatura da assistência',
};

/** O que a pessoa declara ao assinar. */
export const signatureDeclarations: Record<SignatureRole, string> = {
  customer:
    'Declaro que deixei o aparelho descrito nesta ordem de serviço e que li e concordo com os termos da assistência.',
  shop: 'Recebi o aparelho descrito nesta ordem de serviço nas condições informadas.',
};

export const isSignatureRole = (value: unknown): value is SignatureRole =>
  typeof value === 'string' && (signatureRoles as readonly string[]).includes(value);

/** A cópia do que estava na tela quando a pessoa assinou. */
export type SignedContent = {
  code: string;
  customer: string;
  device: string;
  problem: string;
  service: string;
  total: number;
  terms: string;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function signedContent(
  order: {
    code?: string;
    customer?: string;
    device?: string;
    problem?: string;
    service?: string;
    total?: number;
  },
  shop?: { terms?: string } | null,
): SignedContent {
  return {
    code: text(order.code),
    customer: text(order.customer),
    device: text(order.device),
    problem: text(order.problem),
    service: text(order.service),
    total: Math.round(Number(order.total || 0) * 100) / 100,
    terms: text(shop?.terms),
  };
}

/** JSON com as chaves em ordem fixa: o mesmo conteúdo dá sempre o mesmo hash. */
export const canonicalContent = (content: SignedContent) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(content)
        .sort()
        .map((key) => [key, content[key as keyof SignedContent]]),
    ),
  );

/**
 * Dados de entrada que mudaram depois da assinatura. Serviço, valor e etapa não
 * contam: mudam depois do diagnóstico, e o valor é aprovado no orçamento.
 */
const entryFields: { key: keyof SignedContent; label: string }[] = [
  { key: 'customer', label: 'cliente' },
  { key: 'device', label: 'aparelho' },
  { key: 'problem', label: 'problema relatado' },
  { key: 'terms', label: 'termos' },
];

export function changedSince(signed: Partial<SignedContent>, current: SignedContent) {
  return entryFields
    .filter(({ key }) => text(signed[key]) !== text(current[key]))
    .map(({ label }) => label);
}

/** O que a impressão e a ficha precisam de uma assinatura. */
export type OrderSignature = {
  role: SignatureRole;
  signerName: string;
  signedAt: string;
  /** PNG em data URL, para a ficha e a impressão. */
  image: string;
  /** Dados de entrada que mudaram depois da assinatura. */
  changed: string[];
};

const zone = 'America/Sao_Paulo';

/** "19/10/2026 às 14:32", no horário de São Paulo. */
export function signedAtLabel(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${day} às ${time}`;
}
