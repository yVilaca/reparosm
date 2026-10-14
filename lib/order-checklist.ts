/**
 * Checklist de entrada: o que funciona, o que tem defeito e onde estão as
 * avarias do aparelho antes do conserto (docs/superpowers/specs/
 * 2026-10-14-checklist-de-entrada-design.md). Puro: serve à tela, às rotas e
 * aos testes.
 */

export const DEVICE_TEST_PATH = '/testar';
/** O teste pelo aparelho é feito no balcão: o link vale pouco tempo. */
export const DEVICE_TEST_MINUTES = 120;

export type CheckState = 'ok' | 'fail' | 'skip';
export type CheckGroup = 'Tela' | 'Câmeras' | 'Som' | 'Energia' | 'Botões e sensores' | 'Conexões';

export const checkGroups: CheckGroup[] = [
  'Tela',
  'Câmeras',
  'Som',
  'Energia',
  'Botões e sensores',
  'Conexões',
];

/**
 * Os testes, na ordem da bancada. `device` diz se o navegador do próprio
 * aparelho consegue fazer o teste (os outros a loja marca à mão).
 */
export const checks = [
  {
    key: 'touch',
    label: 'Toque da tela',
    group: 'Tela',
    device: true,
    how: 'Arraste o dedo por toda a tela, inclusive cantos e bordas.',
  },
  {
    key: 'display',
    label: 'Imagem da tela',
    group: 'Tela',
    device: true,
    how: 'Procure manchas, linhas, pontos apagados e brilho falhando.',
  },
  {
    key: 'rear-camera',
    label: 'Câmera traseira',
    group: 'Câmeras',
    device: true,
    how: 'Abra a câmera e confira o foco de perto e de longe.',
  },
  {
    key: 'front-camera',
    label: 'Câmera frontal',
    group: 'Câmeras',
    device: true,
    how: 'Abra a câmera de selfie e veja se a imagem está nítida.',
  },
  {
    key: 'flash',
    label: 'Lanterna',
    group: 'Câmeras',
    device: true,
    how: 'Ligue a lanterna pelo atalho do aparelho.',
  },
  {
    key: 'speaker',
    label: 'Alto-falante',
    group: 'Som',
    device: true,
    how: 'Toque um vídeo no volume alto: não pode chiar nem falhar.',
  },
  {
    key: 'earpiece',
    label: 'Auricular',
    group: 'Som',
    device: false,
    how: 'Faça uma ligação e ouça pelo alto-falante de cima.',
  },
  {
    key: 'microphone',
    label: 'Microfone',
    group: 'Som',
    device: true,
    how: 'Grave um áudio e ouça de volta.',
  },
  {
    key: 'charging',
    label: 'Carregamento',
    group: 'Energia',
    device: true,
    how: 'Ligue no carregador: o aparelho precisa indicar que está carregando.',
  },
  {
    key: 'battery',
    label: 'Bateria',
    group: 'Energia',
    device: false,
    how: 'Veja a saúde da bateria nos ajustes e se ela segura a carga.',
  },
  {
    key: 'buttons',
    label: 'Botões',
    group: 'Botões e sensores',
    device: false,
    how: 'Aperte o liga/desliga e os dois botões de volume.',
  },
  {
    key: 'biometrics',
    label: 'Biometria',
    group: 'Botões e sensores',
    device: false,
    how: 'A digital ou o reconhecimento facial desbloqueiam o aparelho?',
  },
  {
    key: 'proximity',
    label: 'Sensor de proximidade',
    group: 'Botões e sensores',
    device: false,
    how: 'Numa ligação, a tela apaga ao cobrir a parte de cima.',
  },
  {
    key: 'motion',
    label: 'Giroscópio',
    group: 'Botões e sensores',
    device: true,
    how: 'Gire o aparelho: a tela acompanha?',
  },
  {
    key: 'vibration',
    label: 'Vibração',
    group: 'Botões e sensores',
    device: true,
    how: 'Ative o modo silencioso ou receba uma notificação.',
  },
  {
    key: 'signal',
    label: 'Chip e sinal',
    group: 'Conexões',
    device: false,
    how: 'Com um chip, o aparelho mostra sinal e faz ligação?',
  },
  {
    key: 'wifi',
    label: 'Wi-Fi',
    group: 'Conexões',
    device: false,
    how: 'Conecte numa rede e abra uma página.',
  },
  {
    key: 'bluetooth',
    label: 'Bluetooth',
    group: 'Conexões',
    device: false,
    how: 'Procure um fone ou uma caixa de som e conecte.',
  },
] as const satisfies readonly {
  key: string;
  label: string;
  group: CheckGroup;
  device: boolean;
  how: string;
}[];

export type CheckKey = (typeof checks)[number]['key'];
export type CheckDef = (typeof checks)[number];

const byKey = new Map<string, CheckDef>(checks.map((check) => [check.key, check]));
export const checkDef = (key: string) => byKey.get(key);
export const deviceCheckKeys = checks.filter((check) => check.device).map((check) => check.key);

export type CheckItem = {
  state: CheckState;
  note?: string;
  /** Quem respondeu: a loja à mão ou o próprio aparelho pelo link. */
  by: 'shop' | 'device';
  at: string;
};

export type DamageKind = 'crack' | 'scratch' | 'dent' | 'other';
export const damageKinds: { value: DamageKind; label: string }[] = [
  { value: 'crack', label: 'Trinca' },
  { value: 'scratch', label: 'Risco' },
  { value: 'dent', label: 'Amassado' },
  { value: 'other', label: 'Outro' },
];
export const damageLabel = (kind: DamageKind) =>
  damageKinds.find((item) => item.value === kind)?.label ?? 'Outro';

/** Marcador no desenho do aparelho; x e y vão de 0 a 1 sobre o corpo. */
export type DamageMark = {
  id: string;
  side: 'front' | 'back';
  x: number;
  y: number;
  kind: DamageKind;
  note?: string;
};

/** O que o navegador do aparelho conta sobre ele mesmo. */
export type DeviceInfo = { platform?: string; screen?: string; battery?: number; at?: string };

export type Checklist = {
  /** "O aparelho liga?" Sem resposta, `undefined`. */
  powersOn?: boolean;
  items: Partial<Record<CheckKey, CheckItem>>;
  marks: DamageMark[];
  notes?: string;
  device?: DeviceInfo;
  completedAt?: string;
};

/** Alteração da loja: só o que mudou (um teste em `null` volta a "não respondido"). */
export type ChecklistPatch = {
  powersOn?: boolean | null;
  items?: Partial<Record<CheckKey, { state: CheckState; note?: string } | null>>;
  marks?: DamageMark[];
  notes?: string;
  completed?: boolean;
};

export type DeviceResult = { key: CheckKey; state: 'ok' | 'fail'; note?: string };

/** Situação do link do teste pelo aparelho, para a tela da loja. */
export type DeviceTestSession = {
  active: boolean;
  openedAt?: string;
  lastSeenAt?: string;
  expiresAt?: string;
};

/** O que a página aberta no aparelho recebe: nada do cliente. */
export type PublicDeviceTest = {
  shop: string;
  order: { code: string; device: string };
  /** Testes que a loja já respondeu à mão: o aparelho pula. */
  answered: CheckKey[];
};

export const NOTE_LIMIT = 160;
export const NOTES_LIMIT = 1000;
export const MARKS_LIMIT = 40;

export const emptyChecklist = (): Checklist => ({ items: {}, marks: [] });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isState = (value: unknown): value is CheckState =>
  value === 'ok' || value === 'fail' || value === 'skip';
const isKind = (value: unknown): value is DamageKind =>
  damageKinds.some((kind) => kind.value === value);
const unit = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1;
const shortText = (value: unknown, limit: number) =>
  typeof value === 'string' ? value.trim().slice(0, limit) || undefined : undefined;

function readMark(value: unknown): DamageMark | null {
  if (!isObject(value)) return null;
  const { id, side, x, y, kind } = value;
  if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id)) return null;
  if (side !== 'front' && side !== 'back') return null;
  if (!unit(x) || !unit(y) || !isKind(kind)) return null;
  const note = shortText(value.note, NOTE_LIMIT);
  return { id, side, x: x as number, y: y as number, kind, ...(note ? { note } : {}) };
}

/** Lê o que está no banco, descartando o que não for do formato. */
export function readChecklist(value: unknown): Checklist {
  const data = isObject(value) ? value : {};
  const items: Checklist['items'] = {};
  if (isObject(data.items))
    for (const [key, raw] of Object.entries(data.items)) {
      if (!byKey.has(key) || !isObject(raw) || !isState(raw.state)) continue;
      const note = shortText(raw.note, NOTE_LIMIT);
      items[key as CheckKey] = {
        state: raw.state,
        by: raw.by === 'device' ? 'device' : 'shop',
        at: typeof raw.at === 'string' ? raw.at : '',
        ...(note ? { note } : {}),
      };
    }
  const marks = Array.isArray(data.marks)
    ? data.marks.map(readMark).filter((mark): mark is DamageMark => mark !== null)
    : [];
  const device = isObject(data.device) ? readDeviceInfo(data.device) : undefined;
  return {
    ...(typeof data.powersOn === 'boolean' ? { powersOn: data.powersOn } : {}),
    items,
    marks,
    ...(shortText(data.notes, NOTES_LIMIT) ? { notes: shortText(data.notes, NOTES_LIMIT) } : {}),
    ...(device ? { device } : {}),
    ...(typeof data.completedAt === 'string' ? { completedAt: data.completedAt } : {}),
  };
}

function readDeviceInfo(value: Record<string, unknown>): DeviceInfo | undefined {
  const info: DeviceInfo = {};
  const platform = shortText(value.platform, 80);
  const screen = shortText(value.screen, 40);
  if (platform) info.platform = platform;
  if (screen) info.screen = screen;
  if (typeof value.battery === 'number' && Number.isInteger(value.battery))
    if (value.battery >= 0 && value.battery <= 100) info.battery = value.battery;
  if (typeof value.at === 'string') info.at = value.at;
  return Object.keys(info).length ? info : undefined;
}

/**
 * Valida a alteração mandada pela loja. Qualquer coisa fora do formato invalida
 * tudo (null): a rota responde 400 em vez de gravar metade.
 */
export function parsePatch(value: unknown): ChecklistPatch | null {
  if (!isObject(value)) return null;
  const allowed = new Set(['powersOn', 'items', 'marks', 'notes', 'completed']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const patch: ChecklistPatch = {};
  if ('powersOn' in value) {
    if (value.powersOn !== null && typeof value.powersOn !== 'boolean') return null;
    patch.powersOn = value.powersOn;
  }
  if ('items' in value) {
    if (!isObject(value.items)) return null;
    const items: NonNullable<ChecklistPatch['items']> = {};
    for (const [key, raw] of Object.entries(value.items)) {
      if (!byKey.has(key)) return null;
      if (raw === null) {
        items[key as CheckKey] = null;
        continue;
      }
      if (!isObject(raw) || !isState(raw.state)) return null;
      if (raw.note !== undefined && typeof raw.note !== 'string') return null;
      const note = shortText(raw.note, NOTE_LIMIT);
      items[key as CheckKey] = { state: raw.state, ...(note ? { note } : {}) };
    }
    patch.items = items;
  }
  if ('marks' in value) {
    if (!Array.isArray(value.marks) || value.marks.length > MARKS_LIMIT) return null;
    const marks = value.marks.map(readMark);
    if (marks.some((mark) => mark === null)) return null;
    if (new Set(marks.map((mark) => mark!.id)).size !== marks.length) return null;
    patch.marks = marks as DamageMark[];
  }
  if ('notes' in value) {
    if (typeof value.notes !== 'string' || value.notes.length > NOTES_LIMIT) return null;
    patch.notes = value.notes;
  }
  if ('completed' in value) {
    if (typeof value.completed !== 'boolean') return null;
    patch.completed = value.completed;
  }
  return patch;
}

/** Aplica a alteração da loja. Testes respondidos pela loja ficam marcados como dela. */
export function applyPatch(current: Checklist, patch: ChecklistPatch, at: string): Checklist {
  const next: Checklist = { ...current, items: { ...current.items }, marks: current.marks };
  if (patch.powersOn !== undefined) {
    if (patch.powersOn === null) delete next.powersOn;
    else next.powersOn = patch.powersOn;
  }
  for (const [key, item] of Object.entries(patch.items ?? {})) {
    if (item === null || item === undefined) delete next.items[key as CheckKey];
    else next.items[key as CheckKey] = { ...item, by: 'shop', at };
  }
  if (patch.marks) next.marks = patch.marks;
  if (patch.notes !== undefined) {
    const notes = patch.notes.trim();
    if (notes) next.notes = notes;
    else delete next.notes;
  }
  if (patch.completed === true) next.completedAt = at;
  if (patch.completed === false) delete next.completedAt;
  return next;
}

/** Valida o que o aparelho manda: só testes que o navegador faz, só funciona/defeito. */
export function parseDeviceReport(
  value: unknown,
): { results: DeviceResult[]; device?: DeviceInfo } | null {
  if (!isObject(value)) return null;
  const results: DeviceResult[] = [];
  if (value.results !== undefined) {
    if (!Array.isArray(value.results) || value.results.length > deviceCheckKeys.length) return null;
    for (const raw of value.results) {
      if (!isObject(raw)) return null;
      if (!(deviceCheckKeys as readonly string[]).includes(raw.key as string)) return null;
      if (raw.state !== 'ok' && raw.state !== 'fail') return null;
      const note = shortText(raw.note, NOTE_LIMIT);
      results.push({ key: raw.key as CheckKey, state: raw.state, ...(note ? { note } : {}) });
    }
  }
  const device = isObject(value.device) ? readDeviceInfo(value.device) : undefined;
  if (!results.length && !device) return null;
  return { results, ...(device ? { device } : {}) };
}

/** O resultado do aparelho só preenche o que a loja não respondeu à mão. */
export function applyDeviceReport(
  current: Checklist,
  report: { results: DeviceResult[]; device?: DeviceInfo },
  at: string,
): Checklist {
  const next: Checklist = { ...current, items: { ...current.items } };
  for (const result of report.results) {
    if (next.items[result.key]?.by === 'shop') continue;
    next.items[result.key] = {
      state: result.state,
      by: 'device',
      at,
      ...(result.note ? { note: result.note } : {}),
    };
  }
  // O aparelho abriu o teste: ele liga.
  if (report.results.length && next.powersOn === undefined) next.powersOn = true;
  if (report.device) next.device = { ...current.device, ...report.device, at };
  return next;
}

export type ChecklistSummary = {
  status: 'empty' | 'partial' | 'done';
  answered: number;
  total: number;
  ok: number;
  fail: number;
  skip: number;
  defects: string[];
  marks: number;
  /** Uma frase com o que importa: defeitos, avarias ou que está tudo bem. */
  text: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function checklistSummary(checklist: Checklist | null | undefined): ChecklistSummary {
  const list = checklist ?? emptyChecklist();
  const off = list.powersOn === false;
  const items = checks.map((check) => list.items[check.key]);
  const answered = off ? 0 : items.filter(Boolean).length;
  const count = (state: CheckState) =>
    off ? 0 : items.filter((item) => item?.state === state).length;
  const defects = off
    ? []
    : checks.filter((check) => list.items[check.key]?.state === 'fail').map((check) => check.label);
  const marks = list.marks.length;
  const marksText = marks ? `${plural(marks, 'avaria marcada', 'avarias marcadas')}.` : '';
  const touched = off || answered > 0 || marks > 0 || list.powersOn !== undefined;
  const status = list.completedAt ? 'done' : touched ? 'partial' : 'empty';
  let text: string;
  if (off) text = ['O aparelho não liga: sem testes de funcionamento.', marksText].join(' ').trim();
  else if (defects.length)
    text = [`${plural(defects.length, 'defeito', 'defeitos')}: ${defects.join(', ')}.`, marksText]
      .join(' ')
      .trim();
  else if (answered)
    text = [
      answered === checks.length
        ? 'Tudo funcionando.'
        : `${answered} de ${checks.length} testados, sem defeito.`,
      marksText || 'Nenhuma avaria marcada.',
    ].join(' ');
  else text = marksText || 'Nenhum teste feito ainda.';
  return {
    status,
    answered,
    total: checks.length,
    ok: count('ok'),
    fail: count('fail'),
    skip: count('skip'),
    defects,
    marks,
    text,
  };
}
