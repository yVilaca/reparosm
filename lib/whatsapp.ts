import { query, saveRecord } from '@/lib/db';
import { hasValidWhatsapp, whatsappPhone } from '@/lib/format';
import type { DataObject, Order } from '@/lib/types';

export type WhatsAppConfiguration = {
  token: string;
  phoneNumberId: string;
  wabaId?: string;
  orderTemplate: string;
  statusTemplate: string;
  language: string;
  version: string;
  displayPhone?: string;
  verifiedName?: string;
};
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const bytesToBase64 = (bytes: Uint8Array) => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const base64ToBytes = (value: string) => {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const secretKey = async () => {
  const raw = process.env.WHATSAPP_CONFIG_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw))
    throw new Error('A chave segura do WhatsApp ainda não foi configurada.');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(raw.match(/.{2}/g)!.map((x) => parseInt(x, 16))),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
};
async function encrypt(data: WhatsAppConfiguration) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await secretKey(),
        encoder.encode(JSON.stringify(data)),
      ),
    );
  return { iv: bytesToBase64(iv), cipher: bytesToBase64(cipher) };
}
async function decrypt(data: unknown) {
  if (!isObject(data) || typeof data.iv !== 'string' || typeof data.cipher !== 'string')
    throw new Error('Configuração do WhatsApp inválida.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(data.iv) },
    await secretKey(),
    base64ToBytes(data.cipher),
  );
  return JSON.parse(decoder.decode(plain)) as WhatsAppConfiguration;
}

export async function whatsappConfiguration(
  accountId: string,
): Promise<WhatsAppConfiguration | null> {
  const [saved] = await query<{ iv: string; cipher: string }>(
    'SELECT iv, cipher FROM whatsapp_configs WHERE account_id = $1',
    [accountId],
  );
  if (saved)
    try {
      return await decrypt(saved);
    } catch {
      return null;
    }
  if (
    accountId !== 'account-admin' ||
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID
  )
    return null;
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: process.env.WHATSAPP_WABA_ID,
    orderTemplate: process.env.WHATSAPP_ORDER_TEMPLATE || '',
    statusTemplate: process.env.WHATSAPP_STATUS_TEMPLATE || '',
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR',
    version: process.env.WHATSAPP_GRAPH_VERSION || 'v25.0',
  };
}
export async function saveWhatsappConfiguration(accountId: string, config: WhatsAppConfiguration) {
  const { iv, cipher } = await encrypt(config);
  await query(
    `INSERT INTO whatsapp_configs (account_id, iv, cipher) VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET iv = excluded.iv, cipher = excluded.cipher,
       updated_at = now()`,
    [accountId, iv, cipher],
  );
}

export async function deleteWhatsappConfiguration(accountId: string) {
  await query('DELETE FROM whatsapp_configs WHERE account_id = $1', [accountId]);
}

export async function validateWhatsappConfiguration(config: WhatsAppConfiguration) {
  const response = await fetch(
      `https://graph.facebook.com/${config.version}/${encodeURIComponent(config.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(15000) },
    ),
    result = ((await response.json()) as DataObject) || {},
    error =
      typeof result.error === 'object' && result.error !== null
        ? (result.error as DataObject)
        : null;
  if (!response.ok)
    throw new Error(
      `A Meta recusou a conexão (código ${error?.code || response.status}). Confira o token e o ID do número.`,
    );
  return {
    displayPhone: String(result.display_phone_number || ''),
    verifiedName: String(result.verified_name || ''),
    qualityRating: String(result.quality_rating || 'UNKNOWN'),
  };
}

export async function sendWhatsappTemplate(
  config: WhatsAppConfiguration,
  to: string,
  template: string,
  values: string[],
) {
  const phone = whatsappPhone(to);
  if (!hasValidWhatsapp(to)) throw new Error('Telefone inválido. Use DDD e número.');
  const response = await fetch(
      `https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template,
            language: { code: config.language },
            components: [
              {
                type: 'body',
                parameters: values.map((value) => ({ type: 'text', text: String(value || '—') })),
              },
            ],
          },
        }),
      },
    ),
    result = ((await response.json()) as DataObject) || {},
    error =
      typeof result.error === 'object' && result.error !== null
        ? (result.error as DataObject)
        : null,
    messages = Array.isArray(result.messages) ? result.messages : [],
    firstMessage =
      typeof messages[0] === 'object' && messages[0] !== null ? (messages[0] as DataObject) : null;
  if (!response.ok || typeof firstMessage?.id !== 'string')
    throw new Error(
      `A Meta recusou o envio (código ${error?.code || response.status}). ${error?.error_data || 'Confira o modelo e o destinatário.'}`,
    );
  return { providerId: firstMessage.id, phone };
}

export async function notifyOrder(
  accountId: string,
  orderId: string,
  order: Order,
  event: 'created' | 'status',
) {
  const config = await whatsappConfiguration(accountId),
    template = event === 'created' ? config?.orderTemplate : config?.statusTemplate;
  if (order.whatsappConsent !== true)
    return {
      status: 'skipped',
      reason: 'Envio automático desativado: autorização do cliente não registrada.',
    };
  if (!config || !template)
    return {
      status: 'unconfigured',
      reason: 'OS salva. WhatsApp desta loja ainda não configurado.',
    };
  let status = 'Falha no envio',
    providerId: string | undefined,
    error: string | undefined,
    phone = String(order.phone || '');
  try {
    const sent = await sendWhatsappTemplate(config, phone, template, [
      order.customer,
      order.code,
      order.device,
      order.stage || 'Recebido',
    ]);
    providerId = sent.providerId;
    phone = sent.phone;
    status = 'Aceito pela Meta';
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Falha de conexão com a Meta.';
  }
  await saveRecord('message-' + crypto.randomUUID(), 'message', {
    _accountId: accountId,
    orderId,
    customer: order.customer,
    phone,
    kind: event === 'created' ? 'Confirmação automática da OS' : 'Status automático da OS',
    message: [order.code, order.device, order.stage].join(' · '),
    status,
    providerId,
    error,
    sentAt: new Date().toISOString(),
  });
  return {
    status: providerId ? 'accepted' : 'failed',
    reason: providerId
      ? 'OS salva. Mensagem aceita pela Meta; entrega ainda não confirmada.'
      : 'OS salva. ' + error,
  };
}
