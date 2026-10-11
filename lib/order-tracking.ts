import type { Tone } from '@/components/ui/tone';
import { normalizeOrderStage, type OrderStage } from '@/lib/order-stages';
import type { OrderStatus } from '@/lib/types';

/** O link vale 6 meses: o conserto e a garantia. */
export const TRACKING_DAYS = 180;
/** Links ativos por OS; o seguinte desativa o mais antigo. */
export const MAX_ACTIVE_LINKS = 10;
export const TRACKING_PATH = '/acompanhar';
export const TRACKING_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Tudo o que o cliente recebe. Lista fechada: nada além disso sai da OS. */
export type PublicTracking = {
  shop: {
    name: string;
    phone?: string;
    address?: string;
    hours?: string;
    logoUrl?: string;
  };
  order: {
    code: string;
    firstName: string;
    device: string;
    problem?: string;
    service?: string;
    stage: OrderStage;
    status: OrderStatus;
    createdAt: string;
    total: number;
    /** Quanto já foi recebido desta OS. */
    paid: number;
    deliveredAt?: string;
    warrantyUntil?: string;
  };
  events: { stage: OrderStage; status: OrderStatus; at: string }[];
};

/** O que a loja vê sobre os links de uma OS. */
export type TrackingSummary = {
  active: number;
  lastSentAt?: string;
  lastViewedAt?: string;
  views: number;
};

/** Passos que o cliente acompanha. "Aguardando peça" é um momento do reparo. */
export const trackingSteps = ['Recebido', 'Em reparo', 'Pronto', 'Entregue'] as const;

export type TrackingState = {
  key: 'received' | 'waiting-part' | 'repair' | 'ready' | 'delivered' | 'cancelled';
  title: string;
  tone: Tone;
  /** Índice em `trackingSteps`; -1 quando cancelado. */
  step: number;
};

/** A situação na língua do cliente. Cancelada vale mais que a etapa. */
export function trackingState(stage: string | undefined, status?: string): TrackingState {
  if (status === 'Cancelado')
    return { key: 'cancelled', title: 'Serviço cancelado', tone: 'danger', step: -1 };
  switch (normalizeOrderStage(stage)) {
    case 'Aguardando Peça':
      return { key: 'waiting-part', title: 'Aguardando peça', tone: 'warning', step: 1 };
    case 'Em serviço':
      return { key: 'repair', title: 'Em reparo', tone: 'info', step: 1 };
    case 'Retirada':
      return { key: 'ready', title: 'Pronto para retirada', tone: 'success', step: 2 };
    case 'Concluído':
      return { key: 'delivered', title: 'Entregue', tone: 'neutral', step: 3 };
    default:
      return { key: 'received', title: 'Recebemos seu aparelho', tone: 'neutral', step: 0 };
  }
}

/** A linha que explica o que acontece agora. */
export function trackingDetail(tracking: PublicTracking) {
  const { order } = tracking;
  switch (trackingState(order.stage, order.status).key) {
    case 'cancelled':
      return 'Este serviço foi cancelado. Se tiver dúvidas, fale com a loja.';
    case 'waiting-part':
      return 'A peça está a caminho. O reparo continua assim que ela chegar.';
    case 'repair':
      return 'Seu aparelho está com o técnico.';
    case 'ready':
      return `Pode vir buscar. Informe o número ${order.code} no balcão.`;
    case 'delivered':
      return order.warrantyUntil
        ? `Aparelho entregue. A garantia vale até ${brDate(order.warrantyUntil)}.`
        : 'Aparelho entregue. Obrigado pela preferência.';
    default:
      return 'Ele está na fila para avaliação.';
  }
}

export type TimelineItem = { title: string; tone: Tone; at?: string; current: boolean };

/**
 * Linha do tempo: a entrada na data em que a OS foi aberta e cada mudança que o
 * cliente percebe (mudanças só de cobrança não aparecem). Sem histórico (OS
 * antigas), mostra a situação atual sem inventar data.
 */
export function trackingTimeline(tracking: PublicTracking): TimelineItem[] {
  const { order, events } = tracking;
  const items: TimelineItem[] = [];
  const push = (state: TrackingState, at?: string) => {
    if (items.at(-1)?.title === state.title) return;
    items.push({ title: state.title, tone: state.tone, at, current: false });
  };
  push(trackingState('Recebido'), order.createdAt);
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at)))
    push(trackingState(event.stage, event.status), event.at);
  const current = trackingState(order.stage, order.status);
  if (items.at(-1)?.title !== current.title) push(current);
  items[items.length - 1].current = true;
  return items;
}

/** Data de fim da garantia (dia da entrega + dias de garantia). */
export function warrantyUntil(deliveredAt?: string, warrantyDays?: number) {
  if (!deliveredAt || !warrantyDays || warrantyDays <= 0) return undefined;
  const date = new Date(`${deliveredAt.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + warrantyDays);
  return date.toISOString().slice(0, 10);
}

const zone = 'America/Sao_Paulo';
const dayOf = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(date);
const timeOf = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(
    date,
  );

/** "hoje às 14:32", "ontem às 09:10", "08/10 às 16:20" ou, de outro ano, "08/10/2025 às 16:20". */
export function relativeTime(value: string, now = new Date()) {
  const date = new Date(value);
  const day = dayOf(date);
  const today = dayOf(now);
  const label =
    day === today
      ? 'hoje'
      : day === dayOf(new Date(now.getTime() - 86_400_000))
        ? 'ontem'
        : `${day.slice(8, 10)}/${day.slice(5, 7)}${day.slice(0, 4) === today.slice(0, 4) ? '' : `/${day.slice(0, 4)}`}`;
  return `${label} às ${timeOf(date)}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || '';

/** Quanto falta pagar (nada em OS cancelada). */
export const amountDue = (order: PublicTracking['order']) =>
  order.status === 'Cancelado'
    ? 0
    : Math.max(0, Math.round((order.total - order.paid) * 100) / 100);

export const brDate = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');

/** Mensagem pronta para o WhatsApp da loja. */
export function trackingMessage(
  order: { customer: string; code: string; device: string },
  url: string,
) {
  const name = firstName(order.customer);
  return `Olá${name ? `, ${name}` : ''}! Acompanhe o serviço do seu ${order.device} (${order.code}) por este link: ${url}`;
}
