import { createBrowserToken } from '@/lib/auth';
import { decryptAuthSecret } from '@/lib/auth-secrets';
import {
  authChallengeTransaction,
  authTransaction,
  setAuthUsernameContext,
  setTenantContext,
} from '@/lib/db';
import {
  authContext,
  authenticator,
  consumeChallenge,
  consumeRecoveryCode,
  createChallenge,
  deviceForChallenge,
  deviceForLogin,
  hashBrowserToken,
  isTrusted,
  lockChallenge,
  trustDevice,
  useTotpStep,
} from '@/lib/repos/auth-security';
import {
  clearLoginFailures,
  insertSession,
  MAX_LOGIN_FAILURES,
  recentLoginFailures,
  recordLoginFailure,
  upgradePasswordHash,
} from '@/lib/repos/sessions';
import { hashRecoveryCode, verifyTotp } from '@/lib/totp';
import type { AuthMethod, AuthUserContext, PublicAccount } from '@/lib/types';

export type PrimaryAuthResult =
  | {
      step: 'complete';
      account: PublicAccount;
      sessionToken: string;
      browserToken: string;
    }
  | { step: 'mfa'; browserToken: string; challengeToken: string };

export type MfaProblem = 'invalid' | 'limited' | 'unavailable';

export class MfaError extends Error {
  constructor(readonly problem: MfaProblem) {
    super(problem);
  }
}

const publicAccount = ({ account, user }: AuthUserContext): PublicAccount => ({ ...account, user });

export async function finishPrimaryAuth(input: {
  user: AuthUserContext;
  method: AuthMethod;
  browserToken?: string;
  userAgent: string;
  ip: string;
  upgradedPasswordHash?: string;
}): Promise<PrimaryAuthResult> {
  const rawBrowserToken = input.browserToken ?? createBrowserToken();
  return authTransaction(input.user.user.username, async (run) => {
    const device = await deviceForLogin(
      input.user,
      rawBrowserToken,
      { userAgent: input.userAgent, ip: input.ip },
      run,
    );
    const secondFactor = await authenticator(input.user.user.id, run);
    if (secondFactor?.enabledAt && !isTrusted(device)) {
      if (input.upgradedPasswordHash)
        await upgradePasswordHash(run, input.user.user.id, input.upgradedPasswordHash);
      const challengeToken = await createChallenge(
        {
          user: input.user,
          purpose: 'login',
          method: input.method,
          browserTokenHash: await hashBrowserToken(rawBrowserToken),
          userAgent: input.userAgent,
          ip: input.ip,
        },
        run,
      );
      return { step: 'mfa', browserToken: rawBrowserToken, challengeToken };
    }
    const sessionToken = await insertSession(
      run,
      input.user.user,
      { userAgent: input.userAgent, ip: input.ip },
      input.upgradedPasswordHash,
      device.id,
    );
    return {
      step: 'complete',
      account: publicAccount(input.user),
      sessionToken,
      browserToken: rawBrowserToken,
    };
  });
}

const challengeHash = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('hex');
};

export async function completeMfa(input: {
  challengeToken: string;
  browserToken: string;
  ip: string;
  kind: 'totp' | 'recovery';
  code: string;
  trustDevice?: boolean;
}): Promise<Extract<PrimaryAuthResult, { step: 'complete' }>> {
  const tokenHash = await challengeHash(input.challengeToken);
  const browserTokenHash = await hashBrowserToken(input.browserToken);
  const preview = await authChallengeTransaction(tokenHash, (run) => lockChallenge(tokenHash, run));
  if (!preview || preview.purpose !== 'login' || preview.browserTokenHash !== browserTokenHash)
    throw new MfaError('unavailable');
  const failureKey = `mfa:${preview.userId}`;
  if ((await recentLoginFailures(failureKey, input.ip)) >= MAX_LOGIN_FAILURES)
    throw new MfaError('limited');

  const result = await authChallengeTransaction(tokenHash, async (run) => {
    const challenge = await lockChallenge(tokenHash, run);
    if (
      !challenge ||
      challenge.purpose !== 'login' ||
      challenge.browserTokenHash !== browserTokenHash
    )
      return { status: 'unavailable' as const };
    await setTenantContext(run, challenge.accountId);
    const secondFactor = await authenticator(challenge.userId, run);
    if (!secondFactor?.enabledAt) return { status: 'unavailable' as const };
    const context = await authContext(challenge.accountId, challenge.userId, run);
    const device = challenge.browserTokenHash
      ? await deviceForChallenge(challenge.userId, challenge.browserTokenHash, run)
      : null;
    if (
      !context ||
      !device ||
      context.account.status !== 'active' ||
      context.user.status !== 'active'
    )
      return { status: 'unavailable' as const };

    let accepted = false;
    if (input.kind === 'totp') {
      const verified = verifyTotp(
        await decryptAuthSecret(secondFactor.secretCiphertext),
        input.code,
        {
          lastUsedStep: secondFactor.lastUsedStep,
        },
      );
      accepted = Boolean(
        verified.valid &&
        verified.step !== undefined &&
        (await useTotpStep(challenge.userId, verified.step, run)),
      );
    } else {
      accepted = await consumeRecoveryCode(
        challenge.userId,
        await hashRecoveryCode(input.code),
        run,
      );
    }
    if (!accepted) return { status: 'invalid' as const };
    if (!(await consumeChallenge(tokenHash, run))) return { status: 'unavailable' as const };
    if (input.kind === 'totp' && input.trustDevice) await trustDevice(device.id, 30, run);
    await setAuthUsernameContext(run, context.user.username);
    const sessionToken = await insertSession(
      run,
      context.user,
      { userAgent: challenge.userAgent, ip: challenge.ip },
      undefined,
      device.id,
    );
    return {
      status: 'complete' as const,
      value: {
        step: 'complete' as const,
        account: publicAccount(context),
        sessionToken,
        browserToken: input.browserToken,
      },
    };
  });

  if (result.status === 'invalid') {
    await recordLoginFailure(failureKey, input.ip);
    throw new MfaError('invalid');
  }
  if (result.status !== 'complete') throw new MfaError('unavailable');
  await clearLoginFailures(failureKey, input.ip);
  return result.value;
}
