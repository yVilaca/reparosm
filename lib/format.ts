export function formatMoney(value: number | string | null | undefined): string {
  const number = typeof value === 'number' ? value : Number(value ?? 0);
  return (Number.isFinite(number) ? number : 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function whatsappPhone(value: unknown): string {
  const digits = normalizePhone(value);
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

export function hasValidWhatsapp(value: unknown): boolean {
  return /^\d{12,15}$/.test(whatsappPhone(value));
}

export function whatsappUrl(phone: unknown, message: string): string {
  return `https://wa.me/${whatsappPhone(phone)}?text=${encodeURIComponent(message)}`;
}
