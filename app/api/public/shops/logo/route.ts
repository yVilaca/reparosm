import { publicStoreTransaction } from '@/lib/db';
import { getAccountStatus } from '@/lib/repos/accounts';
import * as shopLogos from '@/lib/repos/shop-logos';

const responseFor = (logo: shopLogos.StoredShopLogo) =>
  new Response(Buffer.from(logo.bytes), {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Disposition': 'inline',
      'Content-Length': String(logo.bytes.byteLength),
      'Content-Security-Policy': "default-src 'none'; img-src 'self'",
      'Content-Type': logo.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get('loja');
  if (!accountId) return Response.json({ error: 'Loja não informada.' }, { status: 400 });
  const logo = await publicStoreTransaction(accountId, async (run) => {
    if ((await getAccountStatus(accountId, run)) !== 'active') return null;
    return shopLogos.get(accountId, run);
  });
  return logo
    ? responseFor(logo)
    : Response.json({ error: 'Logo não encontrada.' }, { status: 404 });
}
