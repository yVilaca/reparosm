import { decryptAuthSecret, encryptAuthSecret } from '@/lib/auth-secrets';
import { clientIp, currentAccount, sameOrigin, sessionToken, verifyPassword } from '@/lib/auth';
import { authEncryptionConfigured } from '@/lib/env';
import type { Query } from '@/lib/db';
import {
  authenticator,
  consumeRecoveryCode,
  disableOwnAuthenticator,
  enableAuthenticator,
  ownSecurityCredentials,
  ownSecuritySummary,
  replaceRecoveryCodes,
  savePendingAuthenticator,
  unlinkOwnGoogle,
  consumeTotpStep,
} from '@/lib/repos/auth-security';
import {
  clearLoginFailures,
  endOtherOwnSessions,
  listOwnDevices,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
  revokeOwnDevice,
  withOwnSession,
} from '@/lib/repos/sessions';
import {
  createRecoveryCodes,
  createTotpEnrollment,
  hashRecoveryCode,
  verifyTotp,
} from '@/lib/totp';
import type { DataObject } from '@/lib/types';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const isObject = (value: unknown): value is DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function state(token: string) {
  const [summary, devices] = await Promise.all([ownSecuritySummary(token), listOwnDevices(token)]);
  return summary ? { ...summary, devices: devices ?? [] } : null;
}

async function authorize(
  run: Query,
  userId: string,
  body: DataObject,
): Promise<{ valid: boolean; totpEnabled: boolean }> {
  const credentials = await ownSecurityCredentials(userId, run);
  if (
    !credentials ||
    !(
      await verifyPassword(
        credentials.username,
        String(body.currentPassword || ''),
        credentials.passwordHash,
      )
    ).valid
  )
    return { valid: false, totpEnabled: Boolean(credentials?.authenticator?.enabledAt) };

  const secondFactor = credentials.authenticator;
  if (!secondFactor?.enabledAt) return { valid: true, totpEnabled: false };
  const code = String(body.code || '').slice(0, 32);
  if (body.kind === 'recovery')
    return {
      valid: await consumeRecoveryCode(userId, await hashRecoveryCode(code), run),
      totpEnabled: true,
    };
  if (body.kind !== 'totp') return { valid: false, totpEnabled: true };
  const checked = verifyTotp(await decryptAuthSecret(secondFactor.secretCiphertext), code, {
    lastUsedStep: secondFactor.lastUsedStep,
  });
  return {
    valid: Boolean(
      checked.valid &&
      checked.step !== undefined &&
      (await consumeTotpStep(userId, checked.step, run)),
    ),
    totpEnabled: true,
  };
}

export async function GET(request: Request) {
  const account = await currentAccount(request);
  const token = sessionToken(request);
  if (!account || !token) return json({ error: 'Não autenticado' }, 401);
  const security = await state(token);
  return security ? json(security) : json({ error: 'Não autenticado' }, 401);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação inválida.' }, 403);
  const account = await currentAccount(request);
  const token = sessionToken(request);
  if (!account || !token) return json({ error: 'Não autenticado' }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  if (!isObject(body)) return json({ error: 'Dados inválidos.' }, 400);

  if (body.action === 'revoke-device') {
    const revoked = await revokeOwnDevice(token, String(body.id || ''));
    return revoked
      ? json({ ok: true, current: revoked.current })
      : json({ error: 'Aparelho não encontrado.' }, 404);
  }
  if (body.action === 'revoke-other-devices')
    return json({ ok: true, ended: (await endOtherOwnSessions(token)) ?? 0 });

  const failureKey = `security:${account.user.username}`;
  const ip = clientIp(request);
  if ((await recentLoginFailures(failureKey, ip)) >= MAX_LOGIN_FAILURES)
    return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);

  if (body.action === 'start-totp') {
    if (!authEncryptionConfigured())
      return json({ error: 'O autenticador não está disponível neste ambiente.' }, 503);
    const enrollment = createTotpEnrollment(account.user.username);
    const result = await withOwnSession(token, async (run, { userId, accountId }) => {
      const credentials = await ownSecurityCredentials(userId, run);
      if (
        !credentials ||
        !(
          await verifyPassword(
            credentials.username,
            String(body.currentPassword || ''),
            credentials.passwordHash,
          )
        ).valid
      )
        return 'invalid' as const;
      if (credentials.authenticator?.enabledAt) return 'enabled' as const;
      await savePendingAuthenticator(
        userId,
        accountId,
        await encryptAuthSecret(enrollment.secret),
        run,
      );
      return 'ok' as const;
    });
    if (result !== 'ok') {
      await recordLoginFailure(failureKey, ip);
      return json(
        {
          error:
            result === 'enabled' ? 'O autenticador já está ativo.' : 'A senha atual não confere.',
        },
        400,
      );
    }
    await clearLoginFailures(failureKey, ip);
    return json(enrollment);
  }

  if (body.action === 'confirm-totp') {
    const recoveryCodes = createRecoveryCodes();
    const codeHashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
    const result = await withOwnSession(token, async (run, { userId }) => {
      const pending = await authenticator(userId, run);
      if (!pending || pending.enabledAt) return false;
      const checked = verifyTotp(
        await decryptAuthSecret(pending.secretCiphertext),
        String(body.code || ''),
      );
      if (!checked.valid || checked.step === undefined) return false;
      await enableAuthenticator(userId, checked.step, codeHashes, run);
      return true;
    });
    if (!result) {
      await recordLoginFailure(failureKey, ip);
      return json({ error: 'O código do autenticador não confere.' }, 400);
    }
    await clearLoginFailures(failureKey, ip);
    return json({ ok: true, recoveryCodes });
  }

  if (
    body.action !== 'regenerate-codes' &&
    body.action !== 'disable-totp' &&
    body.action !== 'unlink-google'
  )
    return json({ error: 'Ação inválida.' }, 400);

  const recoveryCodes = body.action === 'regenerate-codes' ? createRecoveryCodes() : [];
  const codeHashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
  const result = await withOwnSession(token, async (run, { userId, tokenHash }) => {
    const confirmation = await authorize(run, userId, body);
    if (!confirmation.valid) return 'invalid' as const;
    if (body.action === 'regenerate-codes')
      return confirmation.totpEnabled && (await replaceRecoveryCodes(userId, codeHashes, run))
        ? ('ok' as const)
        : ('missing-totp' as const);
    if (body.action === 'disable-totp')
      return confirmation.totpEnabled && (await disableOwnAuthenticator(userId, tokenHash, run))
        ? ('ok' as const)
        : ('missing-totp' as const);
    return (await unlinkOwnGoogle(userId, run)) ? ('ok' as const) : ('missing-google' as const);
  });
  if (result !== 'ok') {
    if (result === 'invalid') await recordLoginFailure(failureKey, ip);
    const messages = {
      invalid: 'A senha ou o código de confirmação não confere.',
      'missing-totp': 'O autenticador não está ativo.',
      'missing-google': 'Não há uma conta Google vinculada.',
    } as const;
    return json({ error: messages[result ?? 'invalid'] }, 400);
  }
  await clearLoginFailures(failureKey, ip);
  return recoveryCodes.length ? json({ ok: true, recoveryCodes }) : json({ ok: true });
}
