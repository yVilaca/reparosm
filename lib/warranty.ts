export type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'unknown';

export type WarrantyPeriod = {
  status: WarrantyStatus;
  expiresAt: string | null;
  daysRemaining: number | null;
};

const dayNumber = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const number = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === value
    ? number / 86_400_000
    : null;
};

export const warrantyDaysFromSetting = (value?: string) => {
  const match = /^\s*(\d{1,4})\s*dias?\s*$/i.exec(value || '');
  const days = Number(match?.[1]);
  return Number.isInteger(days) && days > 0 && days <= 3650 ? days : 90;
};

export function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Re-evaluated on every save: moves to `today` whenever the order freshly
 * transitions into "Retirada" (including a second time, e.g. after a
 * warranty return), otherwise keeps whatever delivery date it already had.
 */
export function resolveDeliveredAt(
  previousDeliveredAt: string | undefined,
  previousStage: string | undefined,
  stage: string,
  today = todayInSaoPaulo(),
): string | undefined {
  return stage === 'Retirada' && previousStage !== 'Retirada' ? today : previousDeliveredAt;
}

export function warrantyPeriod(
  deliveredAt: string | undefined,
  days: number | undefined,
  today = todayInSaoPaulo(),
): WarrantyPeriod {
  const delivered = deliveredAt ? dayNumber(deliveredAt) : null;
  const current = dayNumber(today);
  if (
    delivered === null ||
    current === null ||
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3650
  )
    return { status: 'unknown', expiresAt: null, daysRemaining: null };

  const expiresAt = new Date((delivered + days) * 86_400_000).toISOString().slice(0, 10);
  const daysRemaining = delivered + days - current;
  return {
    status: daysRemaining < 0 ? 'expired' : daysRemaining <= 15 ? 'expiring' : 'active',
    expiresAt,
    daysRemaining,
  };
}
