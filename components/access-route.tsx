'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import BrandLogo from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordRule } from '@/components/user-access';

type Preview =
  | { status: 'loading' }
  | {
      status: 'valid';
      purpose: 'invite' | 'reset' | 'email';
      name: string;
      username: string;
      storeName: string;
      email?: string;
    }
  | { status: 'invalid' | 'used' | 'expired' | 'blocked' | 'email-taken'; error: string }
  | { status: 'confirmed'; email: string };

const fallback = 'Não foi possível abrir o link. Confira a internet e tente de novo.';

async function post(body: object) {
  const response = await fetch('/api/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: fallback }));
  return { ok: response.ok, result };
}

/**
 * Página do link de acesso: convite, nova senha ou confirmação de e-mail. O
 * token vem depois do "#" (não chega ao servidor no carregamento) e sai da barra
 * de endereço assim que a página abre.
 */
export default function AccessRoute() {
  const token = useRef('');
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    token.current = new URLSearchParams(window.location.hash.slice(1)).get('t') || '';
    window.history.replaceState(null, '', window.location.pathname);
    void post({ action: 'inspect', token: token.current })
      .then(({ result }) =>
        setPreview(result.status ? result : { status: 'invalid', error: fallback }),
      )
      .catch(() => setPreview({ status: 'invalid', error: fallback }));
  }, []);

  const consume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview.status !== 'valid') return;
    const form = new FormData(event.currentTarget);
    const password = preview.purpose === 'email' ? undefined : String(form.get('password'));
    if (password !== undefined && password !== form.get('confirm')) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { ok, result } = await post({ action: 'consume', token: token.current, password });
      if (!ok) {
        if (result.status) setPreview(result);
        else setError(result.error || fallback);
        setSaving(false);
        return;
      }
      if (result.signedIn) {
        // Navegação completa: o painel já abre com a sessão nova.
        window.location.replace('/');
        return;
      }
      setPreview({ status: 'confirmed', email: preview.email || '' });
    } catch {
      setError(fallback);
      setSaving(false);
    }
  };

  const title =
    preview.status === 'valid'
      ? preview.purpose === 'invite'
        ? `Olá, ${preview.name.split(' ')[0]}`
        : preview.purpose === 'reset'
          ? 'Crie uma nova senha'
          : 'Confirme seu e-mail'
      : preview.status === 'confirmed'
        ? 'E-mail confirmado'
        : preview.status === 'loading'
          ? 'Abrindo o link…'
          : 'Este link não serve mais';

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-brand-ink p-4">
      <BrandLogo className="w-[200px]" onDark priority sizes="200px" />
      <Card className="w-full max-w-sm shadow-xl ring-0">
        <CardHeader>
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {preview.status === 'valid' && (
            <p className="text-sm text-muted-foreground">
              {preview.purpose === 'invite'
                ? `Crie sua senha para entrar na loja ${preview.storeName}.`
                : preview.purpose === 'reset'
                  ? `Para o seu acesso à loja ${preview.storeName}. Os outros aparelhos conectados saem.`
                  : `Use ${preview.email} para entrar e recuperar a senha.`}
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {preview.status === 'loading' && (
            <p className="text-sm text-muted-foreground" role="status">
              Conferindo o link…
            </p>
          )}

          {preview.status === 'valid' && (
            <form className="grid gap-4" onSubmit={consume}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/60 p-3 text-sm">
                <dt className="text-muted-foreground">Loja</dt>
                <dd className="font-medium">{preview.storeName}</dd>
                <dt className="text-muted-foreground">Seu usuário</dt>
                <dd className="font-medium">{preview.username}</dd>
              </dl>
              {preview.purpose !== 'email' && (
                <>
                  {/* Ajuda o gerenciador de senhas a guardar a senha no usuário certo. */}
                  <input
                    autoComplete="username"
                    className="hidden"
                    defaultValue={preview.username}
                    name="username"
                    readOnly
                  />
                  <div className="grid gap-2">
                    <Label htmlFor="access-password">Nova senha</Label>
                    <div className="relative">
                      <Input
                        autoComplete="new-password"
                        autoFocus
                        className="pr-10"
                        id="access-password"
                        minLength={10}
                        name="password"
                        required
                        type={showPassword ? 'text' : 'password'}
                      />
                      <button
                        aria-controls="access-password"
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
                  <div className="grid gap-2">
                    <Label htmlFor="access-confirm">Repita a senha</Label>
                    <Input
                      autoComplete="new-password"
                      id="access-confirm"
                      minLength={10}
                      name="confirm"
                      required
                      type={showPassword ? 'text' : 'password'}
                    />
                    <p className="text-xs text-muted-foreground">{passwordRule}</p>
                  </div>
                </>
              )}
              {error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button className="w-full" disabled={saving} type="submit">
                {saving
                  ? 'Salvando…'
                  : preview.purpose === 'email'
                    ? 'Confirmar e-mail'
                    : 'Criar senha e entrar'}
              </Button>
            </form>
          )}

          {preview.status === 'confirmed' && (
            <>
              <p className="flex items-start gap-2 text-sm">
                <MailCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Pronto: {preview.email} agora é o seu e-mail no ReparoSM. Você pode entrar com
                  ele.
                </span>
              </p>
              <Button asChild className="w-full">
                <Link href="/">Ir para o ReparoSM</Link>
              </Button>
            </>
          )}

          {preview.status !== 'loading' &&
            preview.status !== 'valid' &&
            preview.status !== 'confirmed' && (
              <>
                <p className="text-sm" role="alert">
                  {preview.error}
                </p>
                {preview.status === 'used' ? (
                  <Button asChild className="w-full">
                    <Link href="/login">Entrar com a senha</Link>
                  </Button>
                ) : (
                  <Button asChild className="w-full">
                    <Link href="/login?esqueci=1">Pedir um novo link</Link>
                  </Button>
                )}
              </>
            )}
        </CardContent>
      </Card>
    </main>
  );
}
