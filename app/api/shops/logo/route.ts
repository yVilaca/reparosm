import { currentAccount, sameOrigin } from '@/lib/auth';
import { tenantTransaction } from '@/lib/db';
import * as shopLogos from '@/lib/repos/shop-logos';
import * as shops from '@/lib/repos/shops';
import { inspectShopLogo, MAX_SHOP_LOGO_BYTES, SHOP_LOGO_UPLOAD_PATH } from '@/lib/shop-logo';

const invalid = (error: string, status = 400) => Response.json({ error }, { status });

const responseFor = (logo: shopLogos.StoredShopLogo, cacheControl: string) =>
  new Response(Buffer.from(logo.bytes), {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Disposition': 'inline',
      'Content-Length': String(logo.bytes.byteLength),
      'Content-Security-Policy': "default-src 'none'; img-src 'self'",
      'Content-Type': logo.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function GET(request: Request) {
  const current = await currentAccount(request);
  if (!current) return invalid('Não autenticado', 401);
  const logo = await shopLogos.get(current.id);
  return logo ? responseFor(logo, 'private, no-store') : invalid('Logo não encontrada.', 404);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return invalid('Origem da solicitação inválida.', 403);
  const current = await currentAccount(request);
  if (!current) return invalid('Não autenticado', 401);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_SHOP_LOGO_BYTES + 128 * 1024)
    return invalid('A logo deve ter até 1 MB.', 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return invalid('Envie um arquivo de logo.');
  if (file.size > MAX_SHOP_LOGO_BYTES) return invalid('A logo deve ter até 1 MB.', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectShopLogo(bytes);
  if (!info) return invalid('Use uma imagem PNG, JPEG ou WebP válida, de até 1 MB.');
  await tenantTransaction(current.id, async (run) => {
    await shopLogos.save(current.id, { ...info, bytes }, run);
    await shops.setLogoSource(current.id, SHOP_LOGO_UPLOAD_PATH, run);
  });
  return Response.json({ logo: SHOP_LOGO_UPLOAD_PATH }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return invalid('Origem da solicitação inválida.', 403);
  const current = await currentAccount(request);
  if (!current) return invalid('Não autenticado', 401);
  await tenantTransaction(current.id, async (run) => {
    await shopLogos.remove(current.id, run);
    await shops.setLogoSource(current.id, undefined, run);
  });
  return Response.json({ ok: true });
}
