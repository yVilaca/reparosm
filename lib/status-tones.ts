import { toneBadge, type Tone } from '@/components/ui/tone';

/**
 * O tom de cada status do negócio, o mesmo em todas as telas: cinza = novo ou
 * normal, azul = em andamento, âmbar = esperando alguém, verde = pronto,
 * vermelho = problema.
 */

export function orderStageTone(stage: string | undefined): Tone {
  switch (stage) {
    case 'Diagnóstico':
    case 'Em reparo':
    case 'Teste final':
      return 'info';
    case 'Aguardando aprovação':
      return 'warning';
    case 'Retirada':
      return 'success';
    default:
      return 'neutral';
  }
}

export function orderPriorityTone(priority: string | undefined): Tone {
  if (priority === 'Urgente') return 'danger';
  if (priority === 'Garantia') return 'warning';
  return 'neutral';
}

/** "Normal" não vira etiqueta: só aparece o que foge do normal. */
export const isNotablePriority = (priority: string | undefined) =>
  priority === 'Urgente' || priority === 'Garantia';

export function quoteStatusTone(status: string | undefined): Tone {
  if (status === 'Aprovado') return 'success';
  if (status === 'Recusado') return 'danger';
  return 'warning';
}

export function clientStatusTone(status: string | undefined): Tone {
  switch (status) {
    case 'Em atendimento':
      return 'info';
    case 'Aguardando':
      return 'warning';
    case 'Concluído':
      return 'success';
    default:
      return 'neutral';
  }
}

export function warrantyStatusTone(status: string | undefined): Tone {
  switch (status) {
    case 'active':
      return 'success';
    case 'expiring':
      return 'warning';
    case 'expired':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Estoque: zerado é problema, até `low` unidades pede atenção. */
export function stockTone(stock: number | undefined, low = 3): Tone {
  const units = Number(stock || 0);
  if (units <= 0) return 'danger';
  return units <= low ? 'warning' : 'success';
}

export const badgeFor = (tone: Tone) => toneBadge[tone];
