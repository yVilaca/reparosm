import { adminTransaction, authTransaction, type AdminActor, type Query } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  confirmEmailEmail,
  newStoreEmail,
  passwordChangedEmail,
  resetEmail,
  teamInviteEmail,
} from '@/lib/email-templates';
import { availableUsername, createStore } from '@/lib/repos/accounts';
import {
  issueLink,
  linkValidity,
  markLinkSent,
  recentLinks,
  type LinkPurpose,
} from '@/lib/repos/access-links';
import { usernameForEmail, withOwnSession } from '@/lib/repos/sessions';
import { linkTarget, requestPasswordReset, type LinkTarget } from '@/lib/repos/users';
import { normalizeUser } from '@/lib/security';
import type { Account, LinkDelivery } from '@/lib/types';

/**
 * Fluxos de acesso por link: convite, nova senha e confirmação de e-mail. O link
 * vai por e-mail quando a pessoa tem e-mail e o SMTP funciona; senão, volta para
 * quem pediu (Dono ou administrador) copiar e mandar, por exemplo, no WhatsApp.
 */

/** Uma transação no contexto de quem está agindo (loja, admin, login da pessoa). */
export type Context = <T>(fn: (run: Query) => Promise<T>) => Promise<T>;

/** E-mail: minúsculo, sem espaços e com cara de e-mail; senão, null. */
export function normalizeEmail(value: unknown) {
  const email = String(value ?? '')
    .trim()
    .toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function linkEmail(purpose: LinkPurpose, target: LinkTarget, url: string, newStore: boolean) {
  const person = {
    to: target.email as string,
    name: target.name,
    username: target.username,
    storeName: target.storeName,
    url,
    validity: linkValidity[purpose],
  };
  if (purpose === 'reset') return resetEmail(person);
  return newStore ? newStoreEmail(person) : teamInviteEmail({ ...person, role: target.role });
}

/**
 * Cria o link da pessoa: convite se ela ainda não criou a senha, nova senha se
 * já criou. Com `send`, tenta o e-mail; o link só volta para quem pediu quando
 * não foi por e-mail (ou quando pediram para copiar).
 */
export async function deliverLink(
  context: Context,
  target: LinkTarget,
  options: { send: boolean; newStore?: boolean },
): Promise<LinkDelivery> {
  const purpose: LinkPurpose = target.ready ? 'reset' : 'invite';
  const link = await context((run) =>
    issueLink(run, { userId: target.id, accountId: target.accountId, purpose }),
  );
  const copy = (reason: Exclude<LinkDelivery, { sent: true }>['reason']): LinkDelivery => ({
    sent: false,
    url: link.url,
    expiresAt: link.expiresAt,
    reason,
  });
  if (!options.send) return copy('copy');
  if (!target.email) return copy('no-email');
  const result = await sendEmail(linkEmail(purpose, target, link.url, Boolean(options.newStore)));
  if (!result.sent) return copy(result.reason);
  await context((run) => markLinkSent(run, link.tokenHash, target.email as string));
  return { sent: true, to: target.email };
}

/** Pedidos de link por pessoa em 15 minutos pelo "esqueci minha senha". */
const MAX_RECENT_LINKS = 3;

/**
 * "Esqueci minha senha" por usuário ou e-mail. Quem tem e-mail recebe o link
 * na hora; quem não tem abre um pedido para o Dono (ou para o administrador, se
 * for Dono). A resposta para quem pediu é sempre a mesma: não revela cadastros.
 */
export async function forgotPassword(identifier: string) {
  const typed = identifier.trim().toLowerCase();
  const email = typed.includes('@') ? normalizeEmail(typed) : null;
  const username = email ? await usernameForEmail(email) : normalizeUser(typed).slice(0, 80);
  if (!username || username.length < 3) return;
  const context: Context = (fn) => authTransaction(username, fn);
  const target = await context((run) => linkTarget(run, { username }));
  if (!target) return;
  if (!target.email) {
    await requestPasswordReset(username);
    return;
  }
  // ponytail: o limite é por pessoa (ninguém enche a caixa de alguém); um mesmo
  // IP pedindo para muitas pessoas não é limitado, e cada uma recebe no máximo 3.
  if ((await context((run) => recentLinks(run, target.id))) >= MAX_RECENT_LINKS) return;
  await deliverLink(context, target, { send: true });
}

/** Aviso de segurança depois de trocar a senha; falha no envio não desfaz a troca. */
export async function notifyPasswordChanged(person: {
  email?: string;
  name: string;
  username: string;
  storeName: string;
}) {
  if (!person.email) return;
  await sendEmail(
    passwordChangedEmail({
      to: person.email,
      name: person.name,
      username: person.username,
      storeName: person.storeName,
    }),
  );
}

export type EmailChange =
  'sent' | 'wrong-password' | 'same-email' | 'too-many' | 'not-sent' | 'invalid';

/**
 * Trocar o próprio e-mail: pede a senha atual (sessão aberta num aparelho
 * esquecido não basta) e só passa a valer quando a pessoa confirma pelo link
 * que chega no e-mail novo.
 */
export async function requestEmailChange(
  token: string,
  change: {
    email: string;
    passwordMatches: (username: string, passwordHash: string) => Promise<boolean>;
  },
): Promise<EmailChange> {
  const issued = await withOwnSession(token, async (run, { userId, accountId }) => {
    const [user] = await run<{
      username: string;
      name: string;
      email: string | null;
      password_hash: string | null;
    }>(
      `SELECT username, name, email, public.user_password_hash(id) AS password_hash
       FROM users WHERE id = $1`,
      [userId],
    );
    if (!user) return 'invalid' as const;
    if (!(await change.passwordMatches(user.username, user.password_hash ?? '')))
      return 'wrong-password' as const;
    if (user.email === change.email) return 'same-email' as const;
    if ((await recentLinks(run, userId)) >= MAX_RECENT_LINKS + 2) return 'too-many' as const;
    const [store] = await run<{ name: string }>('SELECT name FROM accounts WHERE id = $1', [
      accountId,
    ]);
    const link = await issueLink(run, { userId, accountId, purpose: 'email', email: change.email });
    return { link, user, storeName: store?.name ?? '' };
  });
  if (!issued || typeof issued === 'string') return issued ?? 'invalid';
  const result = await sendEmail(
    confirmEmailEmail({
      to: change.email,
      name: issued.user.name,
      username: issued.user.username,
      storeName: issued.storeName,
      url: issued.link.url,
      validity: linkValidity.email,
    }),
  );
  if (!result.sent) return 'not-sent';
  await withOwnSession(token, (run) => markLinkSent(run, issued.link.tokenHash, change.email));
  return 'sent';
}

/** O e-mail novo que a pessoa pediu e ainda não confirmou. */
export async function pendingEmail(token: string) {
  const rows = await withOwnSession(token, (run, { userId }) =>
    run<{ email: string; expires_at: Date | string }>(
      `SELECT email, expires_at FROM access_links
       WHERE user_id = $1 AND purpose = 'email' AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    ),
  );
  const row = rows?.[0];
  return row ? { email: row.email, expiresAt: new Date(row.expires_at).toISOString() } : null;
}

/**
 * Loja nova com o Dono e o convite dele, pelo administrador ou por uma compra.
 * Sem usuário escolhido, ele sai do começo do e-mail.
 */
export async function openStore(
  actor: AdminActor,
  store: {
    name: string;
    ownerName: string;
    ownerEmail?: string;
    username?: string;
    plan?: string;
    dueDate?: string;
    externalRef?: string;
  },
): Promise<{ account: Account; invite: LinkDelivery }> {
  const context: Context = (fn) => adminTransaction(actor, fn);
  const username =
    store.username ||
    (await context((run) =>
      availableUsername(run, (store.ownerEmail ?? store.name).split('@')[0]),
    ));
  const { account, owner } = await createStore(actor, { ...store, username });
  const target: LinkTarget = {
    id: owner.id,
    accountId: account.id,
    username: owner.username,
    name: owner.name,
    role: 'owner',
    email: owner.email,
    storeName: account.name,
    ready: false,
  };
  const invite = await deliverLink(context, target, { send: true, newStore: true });
  return { account, invite };
}
