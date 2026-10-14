import {
  publicDeviceTestTransaction,
  setTenantContext,
  tenantTransaction,
  type Query,
} from '@/lib/db';
import { env } from '@/lib/env';
import {
  applyDeviceReport,
  applyPatch,
  DEVICE_TEST_MINUTES,
  DEVICE_TEST_PATH,
  readChecklist,
  type Checklist,
  type ChecklistPatch,
  type DeviceInfo,
  type DeviceResult,
  type DeviceTestSession,
  type PublicDeviceTest,
} from '@/lib/order-checklist';
import { TRACKING_TOKEN } from '@/lib/order-tracking';
import { getAccountStatus } from '@/lib/repos/accounts';
import { hashLinkToken } from '@/lib/repos/access-links';
import { iso, type Timestamp } from '@/lib/repos/rows';
import * as shops from '@/lib/repos/shops';

/** 32 bytes aleatórios em base64url (43 caracteres), como o link de acompanhamento. */
const newToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

/** O token vai depois do "#": não chega ao servidor nem a logs quando a página abre. */
export const deviceTestUrl = (token: string) => `${env.appUrl}${DEVICE_TEST_PATH}#t=${token}`;

const orderExists = async (run: Query, accountId: string, orderId: string) =>
  (await run('SELECT 1 FROM orders WHERE account_id = $1 AND id = $2', [accountId, orderId]))
    .length > 0;

/** Trava o checklist da OS (criando-o vazio) para ler e gravar sem atropelar. */
async function lockChecklist(run: Query, accountId: string, orderId: string) {
  await run(
    `INSERT INTO order_checklists (account_id, order_id) VALUES ($1, $2)
     ON CONFLICT (account_id, order_id) DO NOTHING`,
    [accountId, orderId],
  );
  const [row] = await run<{ data: unknown }>(
    `SELECT data FROM order_checklists WHERE account_id = $1 AND order_id = $2 FOR UPDATE`,
    [accountId, orderId],
  );
  return readChecklist(row?.data);
}

async function write(
  run: Query,
  accountId: string,
  orderId: string,
  checklist: Checklist,
  by: string | null,
) {
  await run(
    `UPDATE order_checklists SET data = $3::jsonb, updated_by = $4, updated_at = now()
     WHERE account_id = $1 AND order_id = $2`,
    [accountId, orderId, JSON.stringify(checklist), by],
  );
}

/** O link do aparelho que ainda vale (há no máximo um por OS). */
async function session(run: Query, accountId: string, orderId: string): Promise<DeviceTestSession> {
  const [link] = await run<{
    opened_at: Timestamp | null;
    last_seen_at: Timestamp | null;
    expires_at: Timestamp;
  }>(
    `SELECT opened_at, last_seen_at, expires_at FROM order_device_tests
     WHERE account_id = $1 AND order_id = $2 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [accountId, orderId],
  );
  if (!link) return { active: false };
  return {
    active: true,
    expiresAt: iso(link.expires_at),
    ...(link.opened_at ? { openedAt: iso(link.opened_at) } : {}),
    ...(link.last_seen_at ? { lastSeenAt: iso(link.last_seen_at) } : {}),
  };
}

/** Checklist e situação do link do aparelho. Null quando a OS não é da loja. */
export async function get(accountId: string, orderId: string) {
  return tenantTransaction(accountId, async (run) => {
    if (!(await orderExists(run, accountId, orderId))) return null;
    const [row] = await run<{ data: unknown }>(
      'SELECT data FROM order_checklists WHERE account_id = $1 AND order_id = $2',
      [accountId, orderId],
    );
    return {
      checklist: readChecklist(row?.data),
      session: await session(run, accountId, orderId),
    };
  });
}

/** Grava só o que a loja mudou. Null quando a OS não é da loja. */
export async function update(
  accountId: string,
  orderId: string,
  patch: ChecklistPatch,
  userId: string | null,
) {
  return tenantTransaction(accountId, async (run) => {
    if (!(await orderExists(run, accountId, orderId))) return null;
    const current = await lockChecklist(run, accountId, orderId);
    const checklist = applyPatch(current, patch, new Date().toISOString());
    await write(run, accountId, orderId, checklist, userId);
    return { checklist, session: await session(run, accountId, orderId) };
  });
}

/** Gera o link do teste pelo aparelho; o anterior da mesma OS deixa de valer. */
export async function startDeviceTest(accountId: string, orderId: string, userId: string | null) {
  return tenantTransaction(accountId, async (run) => {
    const [order] = await run(
      'SELECT id FROM orders WHERE account_id = $1 AND id = $2 FOR UPDATE',
      [accountId, orderId],
    );
    if (!order) return null;
    await run(
      `UPDATE order_device_tests SET revoked_at = now()
       WHERE account_id = $1 AND order_id = $2 AND revoked_at IS NULL`,
      [accountId, orderId],
    );
    const token = newToken();
    await run(
      `INSERT INTO order_device_tests (token_hash, account_id, order_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [await hashLinkToken(token), accountId, orderId, userId, DEVICE_TEST_MINUTES],
    );
    return { url: deviceTestUrl(token), session: await session(run, accountId, orderId) };
  });
}

/** Encerra o teste pelo aparelho da OS. */
export async function endDeviceTest(accountId: string, orderId: string) {
  return tenantTransaction(accountId, async (run) => {
    await run(
      `UPDATE order_device_tests SET revoked_at = now()
       WHERE account_id = $1 AND order_id = $2 AND revoked_at IS NULL`,
      [accountId, orderId],
    );
    return session(run, accountId, orderId);
  });
}

/**
 * Entra pelo link do aparelho. A transação enxerga só a linha com este hash;
 * achado o link (válido e de loja ativa), entra no contexto da loja dona.
 * Qualquer falha devolve null, sem dizer qual.
 */
async function withDeviceLink<T>(
  token: string,
  fn: (run: Query, link: { account_id: string; order_id: string }, tokenHash: string) => Promise<T>,
): Promise<T | null> {
  if (!TRACKING_TOKEN.test(token)) return null;
  const tokenHash = await hashLinkToken(token);
  return publicDeviceTestTransaction(tokenHash, async (run) => {
    const [link] = await run<{ account_id: string; order_id: string }>(
      `SELECT account_id, order_id FROM order_device_tests
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    if (!link) return null;
    await setTenantContext(run, link.account_id);
    if ((await getAccountStatus(link.account_id, run)) !== 'active') return null;
    const result = await fn(run, link, tokenHash);
    await run(
      `UPDATE order_device_tests
       SET opened_at = COALESCE(opened_at, now()), last_seen_at = now()
       WHERE token_hash = $1`,
      [tokenHash],
    );
    return result;
  });
}

/** O que a página do aparelho mostra: loja, número da OS e modelo. Nada do cliente. */
export async function openDeviceTest(token: string): Promise<PublicDeviceTest | null> {
  return withDeviceLink(token, async (run, link) => {
    const [order] = await run<{ code: string; device: string }>(
      'SELECT code, device FROM orders WHERE account_id = $1 AND id = $2',
      [link.account_id, link.order_id],
    );
    if (!order) return null;
    const [row] = await run<{ data: unknown }>(
      'SELECT data FROM order_checklists WHERE account_id = $1 AND order_id = $2',
      [link.account_id, link.order_id],
    );
    const shop = (await shops.get(link.account_id, 'shop-main', run))?.data;
    const items = readChecklist(row?.data).items;
    return {
      shop: (typeof shop?.name === 'string' && shop.name.trim()) || 'Assistência técnica',
      order: { code: order.code, device: order.device || 'Aparelho' },
      answered: Object.entries(items)
        .filter(([, item]) => item?.by === 'shop')
        .map(([key]) => key as PublicDeviceTest['answered'][number]),
    };
  });
}

/** Grava o que o aparelho testou, sem passar por cima do que a loja respondeu. */
export async function recordDeviceTest(
  token: string,
  report: { results: DeviceResult[]; device?: DeviceInfo },
) {
  const done = await withDeviceLink(token, async (run, link) => {
    const current = await lockChecklist(run, link.account_id, link.order_id);
    const checklist = applyDeviceReport(current, report, new Date().toISOString());
    await write(run, link.account_id, link.order_id, checklist, 'device');
    return true;
  });
  return done === true;
}
