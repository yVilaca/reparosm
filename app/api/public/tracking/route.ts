import { openPublic } from '@/lib/repos/order-tracking';

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

/**
 * Abre um link de acompanhamento. O token chega no corpo (na página ele fica
 * depois do "#"). Toda falha tem a mesma resposta: não dá para sondar o que existe.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const token = (body as { token?: unknown } | null)?.token;
  const tracking = typeof token === 'string' ? await openPublic(token) : null;
  return tracking
    ? Response.json({ tracking }, { headers })
    : Response.json({ error: 'Link inválido ou expirado.' }, { status: 404, headers });
}
