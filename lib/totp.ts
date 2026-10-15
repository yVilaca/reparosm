import { Secret, TOTP } from 'otpauth';

const ISSUER = 'ReparoSM';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const totp = (secret: string | Secret, label = '') =>
  new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

export function createTotpEnrollment(label: string) {
  const secret = new Secret({ size: 20 });
  const authenticator = totp(secret, label.trim().slice(0, 150) || 'Conta');
  return { secret: secret.base32, uri: authenticator.toString() };
}

export function verifyTotp(
  secret: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): { valid: boolean; step?: number } {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return { valid: false };
  try {
    const timestamp = options.now ?? Date.now();
    const authenticator = totp(secret);
    const delta = authenticator.validate({ token, timestamp, window: 1 });
    if (delta === null) return { valid: false };
    const step = authenticator.counter({ timestamp }) + delta;
    if (options.lastUsedStep !== null && options.lastUsedStep !== undefined) {
      if (step <= options.lastUsedStep) return { valid: false };
    }
    return { valid: true, step };
  } catch {
    return { valid: false };
  }
}

export function createRecoveryCodes() {
  const codes = new Set<string>();
  while (codes.size < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const compact = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte & 31]).join('');
    codes.add(`${compact.slice(0, 4)}-${compact.slice(4)}`);
  }
  return [...codes];
}

export function normalizeRecoveryCode(code: string) {
  const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export async function hashRecoveryCode(code: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalizeRecoveryCode(code)),
  );
  return Buffer.from(digest).toString('hex');
}
