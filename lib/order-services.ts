/** Serviços mais comuns da bancada, na ordem dos quadrados da OS. */
export const commonServices = [
  'Troca de tela',
  'Troca de bateria',
  'Conector de carga',
  'Software',
  'Câmera',
  'Alto-falante',
  'Microfone',
  'Botões',
  'Touch',
  'Tampa traseira',
  'Limpeza',
  'Diagnóstico',
] as const;

export type ServiceChoice = { selected: string[]; other: string };

const key = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

/**
 * Lê o campo "Serviço" da OS ("Troca de tela, Touch, Troca do flex"): o que
 * bate com um quadrado vira seleção; o resto fica como outro serviço.
 */
export function parseServices(text?: string): ServiceChoice {
  const parts = (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const known = new Map(commonServices.map((service) => [key(service), service]));
  const picked = new Set<string>();
  const other: string[] = [];
  for (const part of parts) {
    const service = known.get(key(part));
    if (service) picked.add(service);
    else other.push(part);
  }
  return {
    selected: commonServices.filter((service) => picked.has(service)),
    other: other.join(', '),
  };
}

/** Monta o campo "Serviço": os quadrados na ordem da grade e, depois, o outro serviço. */
export function joinServices({ selected, other }: ServiceChoice) {
  const picked = new Set(selected);
  return [...commonServices.filter((service) => picked.has(service)), other.trim()]
    .filter(Boolean)
    .join(', ');
}
