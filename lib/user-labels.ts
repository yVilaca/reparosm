import type { UserRole } from '@/lib/types';

/** Rótulos de acesso usados no menu, em Minha conta, Equipe e Lojas. */

export const roleLabel = (role: UserRole) => (role === 'owner' ? 'Dono' : 'Funcionário');

export const roleHint: Record<UserRole, string> = {
  owner: 'Tudo, inclusive equipe, dados da assistência e exportação.',
  staff: 'O dia a dia: ordens, vendas, clientes, estoque e caixa.',
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || '?';

const timeZone = 'America/Sao_Paulo';
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
const time = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);

/** "hoje às 09:12", "ontem às 18:40" ou "08/10 às 09:12". */
export function whenLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round(
    (Date.parse(dayKey(now)) - Date.parse(dayKey(date))) / (24 * 60 * 60 * 1000),
  );
  const day =
    days === 0
      ? 'hoje'
      : days === 1
        ? 'ontem'
        : new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit' }).format(
            date,
          );
  return `${day} às ${time(date)}`;
}

/** Último acesso de alguém, ou que ainda não entrou. */
export const lastAccessLabel = (lastLoginAt?: string, now = new Date()) =>
  lastLoginAt ? `Último acesso ${whenLabel(lastLoginAt, now)}` : 'Ainda não entrou';

/** "Chrome no Windows", "Safari no iPhone"… a partir do user agent. */
export function deviceLabel(userAgent: string) {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  if (browser && system) return `${browser} no ${system}`;
  return browser || system || 'Navegador desconhecido';
}
