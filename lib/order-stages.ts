export const orderStages = [
  'Recebido',
  'Aguardando Peça',
  'Em serviço',
  'Retirada',
  'Concluído',
] as const;

export type OrderStage = (typeof orderStages)[number];

/** Keep existing orders in the current workflow without rewriting historical data. */
export function normalizeOrderStage(stage?: string): OrderStage {
  if (stage === 'Diagnóstico' || stage === 'Em reparo' || stage === 'Teste final')
    return 'Em serviço';
  if (stage === 'Aguardando aprovação') return 'Aguardando Peça';
  return orderStages.includes(stage as OrderStage) ? (stage as OrderStage) : 'Recebido';
}
