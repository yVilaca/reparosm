import { env, requiredEnv } from '@/lib/env';

const VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64url = /^[A-Za-z0-9_-]+$/;

const encode = (value: Uint8Array) => Buffer.from(value).toString('base64url');

const decode = (value: string) => {
  if (!base64url.test(value)) throw new Error('Segredo de autenticação inválido.');
  const decoded = new Uint8Array(Buffer.from(value, 'base64url'));
  if (encode(decoded) !== value) throw new Error('Segredo de autenticação inválido.');
  return decoded;
};

async function key() {
  const raw = requiredEnv('AUTH_ENCRYPTION_KEY', env.authEncryptionKey, /^[a-f0-9]{64}$/i);
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(raw.match(/.{2}/g)!, (byte) => parseInt(byte, 16)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAuthSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(VERSION) },
      await key(),
      encoder.encode(value),
    ),
  );
  return `${VERSION}.${encode(iv)}.${encode(ciphertext)}`;
}

export async function decryptAuthSecret(payload: string) {
  const [version, ivValue, ciphertextValue, extra] = payload.split('.');
  if (version !== VERSION || !ivValue || !ciphertextValue || extra)
    throw new Error('Segredo de autenticação inválido.');

  const iv = decode(ivValue);
  if (iv.byteLength !== 12) throw new Error('Segredo de autenticação inválido.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(VERSION) },
    await key(),
    decode(ciphertextValue),
  );
  return decoder.decode(plain);
}
