import { createHash } from 'node:crypto';
import { tenantTransaction, type Query } from '@/lib/db';
import {
  canonicalContent,
  changedSince,
  MAX_SIGNATURE_BYTES,
  signedContent,
  type OrderSignature,
  type SignatureRole,
  type SignedContent,
} from '@/lib/order-signatures';
import * as orders from '@/lib/repos/orders';
import { iso, type Timestamp } from '@/lib/repos/rows';
import * as shops from '@/lib/repos/shops';
import { inspectShopLogo } from '@/lib/shop-logo';

type SignatureRow = {
  order_id: string;
  role: SignatureRole;
  image: Buffer;
  signer_name: string;
  signed_at: Timestamp;
  signed_content: Partial<SignedContent>;
};

/** Lê "data:image/png;base64,..." e devolve os bytes de um PNG válido, ou null. */
export function pngFromDataUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Uint8Array.from(Buffer.from(match[1], 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SIGNATURE_BYTES) return null;
  return inspectShopLogo(bytes)?.contentType === 'image/png' ? bytes : null;
}

async function read(run: Query, accountId: string, orderIds: string[]) {
  const result = new Map<string, OrderSignature[]>();
  if (!orderIds.length) return result;
  const rows = await run<SignatureRow>(
    `SELECT order_id, role, image, signer_name, signed_at, signed_content
     FROM order_signatures WHERE account_id = $1 AND order_id = ANY($2::text[])
     ORDER BY order_id, role`,
    [accountId, orderIds],
  );
  if (!rows.length) return result;
  const shop = (await shops.get(accountId, 'shop-main', run))?.data;
  const current = new Map<string, SignedContent>();
  for (const row of rows) {
    if (!current.has(row.order_id)) {
      const order = await orders.get(accountId, row.order_id, run);
      if (!order) continue;
      current.set(row.order_id, signedContent(order.data, shop));
    }
    const list = result.get(row.order_id) ?? [];
    list.push({
      role: row.role,
      signerName: row.signer_name,
      signedAt: iso(row.signed_at),
      image: `data:image/png;base64,${Buffer.from(row.image).toString('base64')}`,
      changed: changedSince(row.signed_content, current.get(row.order_id)!),
    });
    result.set(row.order_id, list);
  }
  return result;
}

/** Assinaturas de várias OS, por OS (impressão de várias ordens). */
export async function forOrders(accountId: string, orderIds: string[]) {
  return tenantTransaction(accountId, (run) => read(run, accountId, orderIds));
}

/** Assinaturas de uma OS. */
export async function list(accountId: string, orderId: string) {
  return (await forOrders(accountId, [orderId])).get(orderId) ?? [];
}

/**
 * Grava (ou substitui) a assinatura de um papel na OS. A cópia do que foi
 * assinado sai da OS gravada, não do navegador. Null quando a OS não é da loja.
 */
export async function save(
  accountId: string,
  orderId: string,
  role: SignatureRole,
  input: { image: Uint8Array; signerName: string },
  meta: { userId: string | null; ip: string | null; userAgent: string | null },
) {
  return tenantTransaction(accountId, async (run) => {
    const order = await orders.get(accountId, orderId, run);
    if (!order) return null;
    const shop = (await shops.get(accountId, 'shop-main', run))?.data;
    const content = signedContent(order.data, shop);
    const hash = createHash('sha256').update(canonicalContent(content)).digest('hex');
    await run(
      `INSERT INTO order_signatures (account_id, order_id, role, image, signer_name, collected_by,
         ip, user_agent, signed_content, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT (account_id, order_id, role) DO UPDATE SET image = excluded.image,
         signer_name = excluded.signer_name, signed_at = now(),
         collected_by = excluded.collected_by, ip = excluded.ip, user_agent = excluded.user_agent,
         signed_content = excluded.signed_content, content_hash = excluded.content_hash`,
      [
        accountId,
        orderId,
        role,
        Buffer.from(input.image),
        input.signerName,
        meta.userId,
        meta.ip,
        meta.userAgent?.slice(0, 300) ?? null,
        JSON.stringify(content),
        hash,
      ],
    );
    return (await read(run, accountId, [orderId])).get(orderId) ?? [];
  });
}

/** Remove a assinatura de um papel. Null quando a OS não é da loja. */
export async function remove(accountId: string, orderId: string, role: SignatureRole) {
  return tenantTransaction(accountId, async (run) => {
    if (!(await orders.get(accountId, orderId, run))) return null;
    await run(
      'DELETE FROM order_signatures WHERE account_id = $1 AND order_id = $2 AND role = $3',
      [accountId, orderId, role],
    );
    return (await read(run, accountId, [orderId])).get(orderId) ?? [];
  });
}
