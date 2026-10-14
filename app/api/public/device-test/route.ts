import { parseDeviceReport } from '@/lib/order-checklist';
import { openDeviceTest, recordDeviceTest } from '@/lib/repos/order-checklist';

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const invalid = () =>
  Response.json({ error: 'Link inválido ou expirado.' }, { status: 404, headers });

/**
 * Teste pelo próprio aparelho. O token chega no corpo (na página ele fica depois
 * do "#"). Sem resultados, abre o teste; com resultados, grava. Toda falha de
 * link tem a mesma resposta: não dá para sondar o que existe.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const payload = (body ?? {}) as { token?: unknown; results?: unknown; device?: unknown };
  const token = typeof payload.token === 'string' ? payload.token : '';
  if (payload.results === undefined && payload.device === undefined) {
    const test = token ? await openDeviceTest(token) : null;
    return test ? Response.json({ test }, { headers }) : invalid();
  }
  const report = parseDeviceReport({ results: payload.results, device: payload.device });
  if (!report) return Response.json({ error: 'Resultado inválido.' }, { status: 400, headers });
  return token && (await recordDeviceTest(token, report))
    ? Response.json({ ok: true }, { headers })
    : invalid();
}
