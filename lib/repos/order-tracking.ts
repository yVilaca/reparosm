import {
  publicTrackingTransaction,
  setTenantContext,
  tenantQueryFor,
  tenantTransaction,
} from '@/lib/db';
import { env } from '@/lib/env';
import { normalizeOrderStage } from '@/lib/order-stages';
import {
  firstName,
  MAX_ACTIVE_LINKS,
  TRACKING_DAYS,
  TRACKING_PATH,
  TRACKING_TOKEN,
  warrantyUntil,
  type PublicTracking,
  type TrackingSummary,
} from '@/lib/order-tracking';
import { getAccountStatus } from '@/lib/repos/accounts';
import { hashLinkToken } from '@/lib/repos/access-links';
import { iso, money, type Timestamp } from '@/lib/repos/rows';
import * as shops from '@/lib/repos/shops';
import { PUBLIC_SHOP_LOGO_PATH } from '@/lib/shop-logo';
import type { OrderStatus } from '@/lib/types';

/** 32 bytes aleatórios em base64url (43 caracteres, sem "="). */
const newToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

/** O token vai depois do "#": não chega ao servidor nem a logs quando a página abre. */
export const trackingUrl = (token: string) => `${env.appUrl}${TRACKING_PATH}#t=${token}`;

/**
 * Gera um link novo para a OS. Os anteriores continuam valendo (o token não fica
 * guardado, então não dá para reenviar um antigo); além de 10 ativos, o mais
 * antigo deixa de valer. Null quando a OS não é da loja.
 */
export async function issue(accountId: string, orderId: string, userId: string | null) {
  return tenantTransaction(accountId, async (run) => {
    const [order] = await run<{ id: string }>(
      'SELECT id FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE',
      [accountId, orderId],
    );
    if (!order) return null;
    const token = newToken();
    await run(
      `INSERT INTO order_tracking_links (token_hash, account_id, order_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
      [await hashLinkToken(token), accountId, orderId, userId, TRACKING_DAYS],
    );
    await run(
      `UPDATE order_tracking_links SET revoked_at = now()
       WHERE token_hash IN (
         SELECT token_hash FROM order_tracking_links
         WHERE account_id = $1 AND order_id = $2 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC, token_hash OFFSET $3
       )`,
      [accountId, orderId, MAX_ACTIVE_LINKS],
    );
    return { url: trackingUrl(token) };
  });
}

/** Quantos links valem, quando foi o último envio e se o cliente abriu. */
export async function summary(accountId: string, orderId: string): Promise<TrackingSummary> {
  const [row] = await tenantQueryFor(accountId)<{
    active: number;
    last_sent_at: Timestamp | null;
    last_viewed_at: Timestamp | null;
    views: number;
  }>(
    `SELECT count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS active,
       max(created_at) AS last_sent_at, max(last_viewed_at) AS last_viewed_at,
       COALESCE(sum(views), 0)::int AS views
     FROM order_tracking_links WHERE account_id = $1 AND order_id = $2`,
    [accountId, orderId],
  );
  return {
    active: row?.active ?? 0,
    lastSentAt: row?.last_sent_at ? iso(row.last_sent_at) : undefined,
    lastViewedAt: row?.last_viewed_at ? iso(row.last_viewed_at) : undefined,
    views: row?.views ?? 0,
  };
}

/** Desativa todos os links da OS. Devolve quantos estavam valendo. */
export async function revokeAll(accountId: string, orderId: string) {
  const rows = await tenantQueryFor(accountId)(
    `UPDATE order_tracking_links SET revoked_at = now()
     WHERE account_id = $1 AND order_id = $2 AND revoked_at IS NULL AND expires_at > now()
     RETURNING token_hash`,
    [accountId, orderId],
  );
  return rows.length;
}

/**
 * Abre o link do cliente. A transação enxerga só a linha do link com este hash;
 * achado o link, entra no contexto da loja dona para ler a OS e devolve só os
 * campos de `PublicTracking`. Qualquer falha devolve null (sem dizer qual).
 */
export async function openPublic(token: string): Promise<PublicTracking | null> {
  if (!TRACKING_TOKEN.test(token)) return null;
  const tokenHash = await hashLinkToken(token);
  return publicTrackingTransaction(tokenHash, async (run) => {
    const [link] = await run<{ account_id: string; order_id: string }>(
      `SELECT account_id, order_id FROM order_tracking_links
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    if (!link) return null;
    await setTenantContext(run, link.account_id);
    if ((await getAccountStatus(link.account_id, run)) !== 'active') return null;
    const [order] = await run<{
      code: string;
      customer: string;
      device: string;
      problem: string | null;
      service: string | null;
      stage: string;
      status: OrderStatus;
      total: string;
      paid: string;
      created_at: Timestamp;
      delivered_at: string | null;
      warranty_days: number | null;
    }>(
      `SELECT o.code, o.customer, o.device, o.problem, o.service, o.stage, o.status, o.total,
         COALESCE((SELECT sum(c.value) FROM cash_entries c WHERE c.account_id = o.account_id
                     AND c.order_id = o.id AND c.kind = 'in'), 0) AS paid,
         o.created_at, o.delivered_at::text AS delivered_at, o.warranty_days
       FROM orders o WHERE o.account_id = $1 AND o.id = $2`,
      [link.account_id, link.order_id],
    );
    if (!order) return null;
    const events = await run<{ stage: string; status: OrderStatus; created_at: Timestamp }>(
      `SELECT stage, status, created_at FROM order_events
       WHERE account_id = $1 AND order_id = $2 ORDER BY created_at, id`,
      [link.account_id, link.order_id],
    );
    const shop = (await shops.get(link.account_id, 'shop-main', run))?.data;
    await run(
      `UPDATE order_tracking_links SET views = views + 1, last_viewed_at = now()
       WHERE token_hash = $1`,
      [tokenHash],
    );
    const text = (value?: string | null) => value?.trim() || undefined;
    const logo = typeof shop?.logo === 'string' ? shop.logo : '';
    const deliveredAt = order.delivered_at ?? undefined;
    return {
      shop: {
        name: text(shop?.name) ?? 'Assistência técnica',
        phone: text(shop?.phone),
        address: text(shop?.address),
        hours: text(shop?.hours),
        logoUrl: logo.startsWith(`${PUBLIC_SHOP_LOGO_PATH}?`) ? logo : undefined,
      },
      order: {
        code: order.code,
        firstName: firstName(order.customer),
        device: order.device,
        problem: text(order.problem),
        service: text(order.service),
        stage: normalizeOrderStage(order.stage),
        status: order.status,
        createdAt: iso(order.created_at),
        total: money(order.total),
        paid: money(order.paid),
        deliveredAt,
        warrantyUntil: warrantyUntil(deliveredAt, order.warranty_days ?? undefined),
      },
      events: events.map((event) => ({
        stage: normalizeOrderStage(event.stage),
        status: event.status,
        at: iso(event.created_at),
      })),
    };
  });
}
