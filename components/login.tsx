'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import AuthShell from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PublicAccount } from '@/lib/types';

export type LoginMode = 'login' | 'forgot' | 'mfa' | 'recovery';

const copy: Record<LoginMode, { eyebrow: string; title: string; description: string }> = {
  login: {
    eyebrow: 'Acesso à assistência',
    title: 'Bom ter você de volta.',
    description: 'Entre com seu usuário ou e-mail para continuar de onde parou.',
  },
  forgot: {
    eyebrow: 'Recuperar acesso',
    title: 'Vamos criar uma nova senha.',
    description: 'Informe seu usuário ou e-mail. Se houver um cadastro, enviaremos as instruções.',
  },
  mfa: {
    eyebrow: 'Verificação em duas etapas',
    title: 'Confirme que é você.',
    description: 'Abra seu aplicativo autenticador e informe o código de seis dígitos.',
  },
  recovery: {
    eyebrow: 'Acesso de recuperação',
    title: 'Use um dos seus códigos reserva.',
    description: 'Cada código funciona uma única vez e não torna este dispositivo confiável.',
  },
};

export default function Login({
  onLogin,
  googleEnabled = false,
  initialMode,
  initialError = '',
  startForgot = false,
}: {
  onLogin: (account: PublicAccount) => void;
  googleEnabled?: boolean;
  initialMode?: LoginMode;
  initialError?: string;
  /** Compatibilidade com links antigos de recuperação. */
  startForgot?: boolean;
}) {
  const [mode, setMode] = useState<LoginMode>(initialMode ?? (startForgot ? 'forgot' : 'login'));
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const content = copy[mode];

  const changeMode = (next: LoginMode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const secondFactor = mode === 'mfa' || mode === 'recovery';

    try {
      const response = await fetch(secondFactor ? '/api/auth/mfa' : '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          secondFactor
            ? {
                kind: mode === 'recovery' ? 'recovery' : 'totp',
                code: form.get('code'),
                trustDevice: mode === 'mfa' && form.get('trustDevice') === 'on',
              }
            : {
                action: mode === 'forgot' ? 'forgot-password' : 'login',
                username: form.get('username'),
                ...(mode === 'login' ? { password: form.get('password') } : {}),
              },
        ),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error ||
            (response.status >= 500
              ? 'O sistema não respondeu como deveria. Tente de novo em instantes.'
              : 'Não foi possível continuar.'),
        );
      if (mode === 'forgot') setNotice(result.message);
      else if (result.step === 'mfa') changeMode('mfa');
      else if (result.account) onLogin(result.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const requestMfaRecovery = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-reset' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o pedido.');
      setNotice(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      description={content.description}
      eyebrow={content.eyebrow}
      title={content.title}
      footer={
        mode === 'login' ? (
          <p>Cada pessoa da equipe entra com o próprio acesso. Sua sessão expira após 12 horas.</p>
        ) : undefined
      }
    >
      <form className="grid gap-5" onSubmit={submit}>
        {(mode === 'login' || mode === 'forgot') && (
          <div className="grid gap-2">
            <Label htmlFor="login-username">Usuário ou e-mail</Label>
            <Input
              aria-describedby={error ? 'login-error' : undefined}
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              className="h-11 bg-background"
              id="login-username"
              maxLength={254}
              minLength={3}
              name="username"
              placeholder="nome@exemplo.com"
              required
            />
          </div>
        )}

        {mode === 'login' && (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="login-password">Senha</Label>
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => changeMode('forgot')}
                type="button"
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="relative">
              <Input
                aria-describedby={error ? 'login-error' : undefined}
                aria-invalid={Boolean(error)}
                autoComplete="current-password"
                className="h-11 bg-background pr-11"
                id="login-password"
                name="password"
                placeholder="Sua senha"
                required
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-controls="login-password"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        )}

        {(mode === 'mfa' || mode === 'recovery') && (
          <div className="grid gap-2">
            <Label htmlFor="login-code">
              {mode === 'mfa' ? 'Código do autenticador' : 'Código de recuperação'}
            </Label>
            <Input
              aria-describedby={error ? 'login-error' : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="one-time-code"
              autoFocus
              className="h-12 bg-background font-mono text-lg tracking-[0.22em]"
              id="login-code"
              inputMode={mode === 'mfa' ? 'numeric' : 'text'}
              maxLength={mode === 'mfa' ? 6 : 12}
              name="code"
              pattern={mode === 'mfa' ? '[0-9]*' : undefined}
              placeholder={mode === 'mfa' ? '000000' : 'ABCD-EFGH'}
              required
            />
          </div>
        )}

        {mode === 'mfa' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/55 p-3 text-sm">
            <input className="mt-0.5 size-4" name="trustDevice" type="checkbox" />
            <span>
              <strong className="block font-medium">Confiar neste dispositivo por 30 dias</strong>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Senha ou Google ainda serão pedidos em cada entrada.
              </span>
            </span>
          </label>
        )}

        {error && (
          <p className="text-sm font-medium text-destructive" id="login-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-muted/60 p-3 text-sm leading-6" role="status">
            {notice}
          </p>
        )}

        <Button className="h-11 w-full" disabled={loading} type="submit">
          {loading
            ? 'Aguarde…'
            : mode === 'forgot'
              ? 'Enviar instruções'
              : mode === 'mfa' || mode === 'recovery'
                ? 'Confirmar e entrar'
                : 'Entrar'}
        </Button>

        {mode === 'login' && googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
              ou
            </div>
            <Button asChild className="h-11 w-full" variant="outline">
              <a href="/api/auth/google">
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
                  <path
                    d="M21.35 12.25c0-.73-.06-1.27-.2-1.83h-8.96v3.25h5.26a4.46 4.46 0 0 1-1.95 2.85l-.03.11 2.83 2.18.2.02c1.84-1.7 2.85-4.2 2.85-6.58Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12.19 21.5c2.64 0 4.85-.87 6.47-2.37l-3.16-2.61c-.85.58-1.98.98-3.31.98a5.75 5.75 0 0 1-5.44-3.97l-.11.01-2.95 2.28-.04.1a9.76 9.76 0 0 0 8.54 5.58Z"
                    fill="#34A853"
                  />
                  <path
                    d="M6.75 13.53a6 6 0 0 1-.33-1.95c0-.68.12-1.34.32-1.95v-.11L3.76 7.2l-.1.05a9.93 9.93 0 0 0 0 8.67l3.09-2.39Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12.19 5.66c1.84 0 3.08.8 3.79 1.45l2.75-2.68A9.38 9.38 0 0 0 12.19 1.5a9.76 9.76 0 0 0-8.54 5.75l3.08 2.38a5.78 5.78 0 0 1 5.46-3.97Z"
                    fill="#EB4335"
                  />
                </svg>
                Continuar com Google
              </a>
            </Button>
          </>
        )}

        {mode === 'forgot' && (
          <button
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            disabled={loading}
            onClick={() => changeMode('login')}
            type="button"
          >
            Voltar ao login
          </button>
        )}

        {(mode === 'mfa' || mode === 'recovery') && (
          <div className="grid gap-3 text-center text-sm">
            <button
              className="text-primary hover:underline"
              disabled={loading}
              onClick={() => changeMode(mode === 'mfa' ? 'recovery' : 'mfa')}
              type="button"
            >
              {mode === 'mfa' ? 'Usar um código de recuperação' : 'Usar o aplicativo autenticador'}
            </button>
            <button
              className="text-muted-foreground hover:text-foreground hover:underline"
              disabled={loading}
              onClick={() => void requestMfaRecovery()}
              type="button"
            >
              Não tenho mais acesso ao autenticador
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => changeMode('login')}
              type="button"
            >
              <KeyRound aria-hidden="true" className="size-4" />
              Entrar novamente
            </button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
