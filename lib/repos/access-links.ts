import {
  accessLinkTransaction,
  setAuthUsernameContext,
  setTenantContext,
  type Query,
} from '@/lib/db';
import { env } from '@/lib/env';
import { insertSession, type Device } from '@/lib/repos/sessions';
import { toUser, userColumns, type UserRow } from '@/lib/repos/users';
import type { StoreUser } from '@/lib/types';

/**
 * Links de acesso de uso único: convite (criar a senha), nova senha (esqueci) e
 * confirmação de e-mail. O token tem 256 bits aleatórios e só o hash SHA-256
 * dele fica no banco. Abrir o link nunca o gasta (antivírus de e-mail "clicam"
 * antes da pessoa); só salvar a senha ou confirmar gasta, numa operação atômica.
 */

export type LinkPurpose = 'invite' | 'reset' | 'email';

/** Validade de cada link, em segundos. */
export const LINK_SECONDS: Record<LinkPurpose, number> = {
  invite: 3 * 24 * 60 * 60,
  reset: 60 * 60,
  email: 24 * 60 * 60,
};

export const linkValidity: Record<LinkPurpose, string> = {
  invite: 'O link vale por 3 dias e só pode ser usado uma vez.',
  reset: 'O link vale por 1 hora e só pode ser usado uma vez.',
  email: 'O link vale por 24 horas.',
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function hashLinkToken(token: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

/** 32 bytes aleatórios em base64url (43 caracteres, sem "="). */
function newToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/** O endereço do link. O token vai depois do "#": não chega ao servidor nem a logs. */
export const linkUrl = (token: string) => `${env.appUrl}/acesso#t=${token}`;

export type IssuedLink = { token: string; tokenHash: string; url: string; expiresAt: string };

/**
 * Cria um link novo para a pessoa. Os links anteriores ainda não usados param
 * de valer: convite e nova senha se substituem; confirmação de e-mail, também.
 * `run` já está num contexto que enxerga essa pessoa (loja, admin, login dela).
 */
export async function issueLink(
  run: Query,
  link: { userId: string; accountId: string; purpose: LinkPurpose; email?: string },
): Promise<IssuedLink> {
  const token = newToken();
  const tokenHash = await hashLinkToken(token);
  // Os anteriores vencem (não somem): seguem contando no limite de pedidos.
  await run(
    `UPDATE access_links SET expires_at = least(expires_at, now())
     WHERE user_id = $1 AND used_at IS NULL
       AND (CASE WHEN purpose = 'email' THEN 'email' ELSE 'password' END)
         = (CASE WHEN $2 = 'email' THEN 'email' ELSE 'password' END)`,
    [link.userId, link.purpose],
  );
  await run(
    `DELETE FROM access_links WHERE user_id = $1 AND created_at < now() - interval '30 days'`,
    [link.userId],
  );
  const [row] = await run<{ expires_at: Date | string }>(
    `INSERT INTO access_links (token_hash, user_id, account_id, purpose, email, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
     RETURNING expires_at`,
    [
      tokenHash,
      link.userId,
      link.accountId,
      link.purpose,
      link.email ?? null,
      LINK_SECONDS[link.purpose],
    ],
  );
  return {
    token,
    tokenHash,
    url: linkUrl(token),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

/** O e-mail com o link saiu: usar este link vai confirmar esse endereço. */
export async function markLinkSent(run: Query, tokenHash: string, sentTo: string) {
  await run('UPDATE access_links SET sent_to = $2 WHERE token_hash = $1 AND used_at IS NULL', [
    tokenHash,
    sentTo,
  ]);
}

/** Pedidos de link de uma pessoa nos últimos 15 minutos (contra e-mail em massa). */
export async function recentLinks(run: Query, userId: string) {
  const [row] = await run<{ count: number }>(
    `SELECT count(*)::int AS count FROM access_links
     WHERE user_id = $1 AND created_at > now() - interval '15 minutes'`,
    [userId],
  );
  return row.count;
}

export type LinkProblem = 'invalid' | 'used' | 'expired' | 'blocked';

type LinkRow = {
  user_id: string;
  account_id: string;
  purpose: LinkPurpose;
  email: string | null;
  sent_to: string | null;
  expires_at: Date | string;
  used_at: Date | string | null;
};

/** Por que um link não serve mais, sem dizer de quem ele é. */
const problemOf = (row: LinkRow | undefined): LinkProblem =>
  !row
    ? 'invalid'
    : row.used_at
      ? 'used'
      : new Date(row.expires_at) <= new Date()
        ? 'expired'
        : 'invalid';

/** Pessoa e loja ativas (a do administrador nunca entra por link). */
async function owner(run: Query, link: Pick<LinkRow, 'user_id' | 'account_id'>) {
  // O contexto da loja vem da linha do link, já conferida pelo hash do token.
  await setTenantContext(run, link.account_id);
  const [user] = await run<UserRow>(`SELECT ${userColumns} FROM users u WHERE u.id = $1`, [
    link.user_id,
  ]);
  const [store] = await run<{ name: string; status: string; role: string }>(
    'SELECT name, status, role FROM accounts WHERE id = $1',
    [link.account_id],
  );
  if (!user || !store || user.status !== 'active' || store.status !== 'active') return null;
  if (store.role !== 'merchant') return null;
  return { user: toUser(user), storeName: store.name };
}

export type LinkPreview =
  | {
      status: 'valid';
      purpose: LinkPurpose;
      name: string;
      username: string;
      storeName: string;
      email?: string;
    }
  | { status: LinkProblem };

const tokenHashOrNull = async (token: string) =>
  TOKEN_PATTERN.test(token) ? hashLinkToken(token) : null;

/** O que o link faz e para quem, sem gastá-lo. */
export async function inspectLink(token: string): Promise<LinkPreview> {
  const tokenHash = await tokenHashOrNull(token);
  if (!tokenHash) return { status: 'invalid' };
  return accessLinkTransaction(tokenHash, async (run) => {
    const [row] = await run<LinkRow>('SELECT * FROM access_links WHERE token_hash = $1', [
      tokenHash,
    ]);
    if (!row || row.used_at || new Date(row.expires_at) <= new Date())
      return { status: problemOf(row) };
    const found = await owner(run, row);
    if (!found) return { status: 'blocked' };
    return {
      status: 'valid',
      purpose: row.purpose,
      name: found.user.name,
      username: found.user.username,
      storeName: found.storeName,
      email: row.purpose === 'email' ? (row.email ?? undefined) : found.user.email,
    };
  });
}

/** Erro que desfaz a transação e vira resposta (o link continua sem uso). */
class LinkRefused extends Error {
  constructor(readonly reason: 'blocked' | 'email-taken') {
    super(reason);
  }
}

export type LinkUse =
  | {
      status: 'ok';
      purpose: LinkPurpose;
      user: StoreUser;
      storeName: string;
      /** Sessão nova (convite e nova senha já entram logados). */
      sessionToken?: string;
    }
  | { status: LinkProblem | 'email-taken' };

/**
 * Usa o link, tudo na mesma transação: marca como usado só se ainda valia,
 * grava a senha (ou o e-mail), desconecta os aparelhos antigos, apaga os outros
 * links pendentes e, para senha, já abre a sessão deste aparelho.
 */
export async function consumeLink(
  token: string,
  use: { hashPassword?: (username: string) => Promise<string>; device: Device },
): Promise<LinkUse> {
  const tokenHash = await tokenHashOrNull(token);
  if (!tokenHash) return { status: 'invalid' };
  try {
    return await accessLinkTransaction(tokenHash, async (run) => {
      const [row] = await run<LinkRow>(
        `UPDATE access_links SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING *`,
        [tokenHash],
      );
      if (!row) {
        const [current] = await run<LinkRow>('SELECT * FROM access_links WHERE token_hash = $1', [
          tokenHash,
        ]);
        return { status: problemOf(current) };
      }
      const found = await owner(run, row);
      if (!found) throw new LinkRefused('blocked');
      const { user } = found;

      if (row.purpose === 'email') {
        try {
          await run(
            `UPDATE users SET email = $2, email_verified_at = now(), updated_at = now()
             WHERE id = $1`,
            [user.id, row.email],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505') throw new LinkRefused('email-taken');
          throw error;
        }
        await run(
          `UPDATE access_links SET expires_at = least(expires_at, now())
           WHERE user_id = $1 AND purpose = 'email' AND used_at IS NULL`,
          [user.id],
        );
        return {
          status: 'ok',
          purpose: row.purpose,
          user: { ...user, email: row.email ?? undefined, emailVerified: true },
          storeName: found.storeName,
        };
      }

      if (!use.hashPassword) throw new Error('senha obrigatória para este link.');
      // O link recebido no e-mail cadastrado prova que o e-mail é da pessoa.
      const verifies = Boolean(row.sent_to && row.sent_to === user.email);
      await run(
        `UPDATE users SET password_hash = $2, must_change_password = false,
           email_verified_at = CASE WHEN $3 THEN now() ELSE email_verified_at END,
           updated_at = now()
         WHERE id = $1`,
        [user.id, await use.hashPassword(user.username), verifies],
      );
      await run('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await run(
        `UPDATE access_links SET expires_at = least(expires_at, now())
         WHERE user_id = $1 AND purpose <> 'email' AND used_at IS NULL`,
        [user.id],
      );
      await run(
        `UPDATE password_requests SET status = 'resolved', resolved_at = now()
         WHERE user_id = $1 AND status = 'pending'`,
        [user.id],
      );
      // Entra logado: a sessão nasce no login da própria pessoa.
      await setAuthUsernameContext(run, user.username);
      const sessionToken = await insertSession(run, user, use.device);
      return {
        status: 'ok',
        purpose: row.purpose,
        user: { ...user, mustChangePassword: false, emailVerified: user.emailVerified || verifies },
        storeName: found.storeName,
        sessionToken,
      };
    });
  } catch (error) {
    if (error instanceof LinkRefused) return { status: error.reason };
    throw error;
  }
}
