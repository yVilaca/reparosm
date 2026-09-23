import { currentAccount, sameOrigin } from '@/lib/auth';
import { deleteRecord } from '@/lib/db';
import {
  saveWhatsappConfiguration,
  sendWhatsappTemplate,
  validateWhatsappConfiguration,
  whatsappConfiguration,
} from '@/lib/whatsapp';
import type { DataObject } from '@/lib/types';

const safe = (
  config: Awaited<ReturnType<typeof whatsappConfiguration>>,
  extra: Record<string, unknown> = {},
) => ({
  configured: Boolean(config?.token && config?.phoneNumberId),
  phoneNumberId: config?.phoneNumberId ? `••••${String(config.phoneNumberId).slice(-4)}` : '',
  displayPhone: config?.displayPhone || '',
  verifiedName: config?.verifiedName || '',
  orderTemplate: config?.orderTemplate || '',
  statusTemplate: config?.statusTemplate || '',
  language: config?.language || 'pt_BR',
  version: config?.version || 'v25.0',
  deliveryTracking: false,
  ...extra,
});
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  return Response.json(safe(await whatsappConfiguration(account.id)), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  if (!isObject(body)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  if (body.action === 'disconnect') {
    await deleteRecord(`whatsapp-config-${account.id}`);
    return Response.json({ ok: true });
  }
  const existing = await whatsappConfiguration(account.id);
  if (body.action === 'save') {
    const config = {
      token: String(body.token || existing?.token || '').trim(),
      phoneNumberId: String(body.phoneNumberId || existing?.phoneNumberId || '').replace(/\D/g, ''),
      wabaId: String(body.wabaId || existing?.wabaId || '').replace(/\D/g, ''),
      orderTemplate: String(body.orderTemplate || '').trim(),
      statusTemplate: String(body.statusTemplate || '').trim(),
      language: String(body.language || 'pt_BR').trim(),
      version: String(body.version || 'v25.0').trim(),
    };
    if (!config.token || !config.phoneNumberId || !config.orderTemplate || !config.statusTemplate)
      return Response.json(
        { error: 'Preencha o token, ID do número e os dois modelos aprovados.' },
        { status: 400 },
      );
    try {
      const meta = await validateWhatsappConfiguration(config);
      const stored = { ...config, ...meta };
      await saveWhatsappConfiguration(account.id, stored);
      return Response.json(safe(stored, { qualityRating: meta.qualityRating }));
    } catch (cause) {
      return Response.json(
        { error: cause instanceof Error ? cause.message : 'Não foi possível validar a conexão.' },
        { status: 400 },
      );
    }
  }
  if (body.action === 'test') {
    if (!existing) return Response.json({ error: 'Conecte o número primeiro.' }, { status: 400 });
    try {
      const sent = await sendWhatsappTemplate(
        existing,
        String(body.to || ''),
        existing.orderTemplate,
        ['Cliente de teste', 'OS-TESTE', 'Aparelho de teste', 'Recebido'],
      );
      return Response.json({ ok: true, providerId: sent.providerId });
    } catch (cause) {
      return Response.json(
        { error: cause instanceof Error ? cause.message : 'Falha no teste.' },
        { status: 400 },
      );
    }
  }
  return Response.json({ error: 'Ação inválida' }, { status: 400 });
}
