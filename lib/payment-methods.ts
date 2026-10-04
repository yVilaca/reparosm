// Mesma lista do Caixa: texto livre (pix, PIX, Pix ) quebraria a soma por forma.
export const PAYMENT_METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de débito',
  'Cartão de crédito',
  'Boleto',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  (PAYMENT_METHODS as readonly unknown[]).includes(value);
