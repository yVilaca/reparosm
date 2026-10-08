'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import BrandLogo from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PublicAccount } from '@/lib/types';

export default function Login({ onLogin }: { onLogin: (account: PublicAccount) => void }) {
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [forgot, setForgot] = useState(false),
    [notice, setNotice] = useState(''),
    [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: forgot ? 'forgot-password' : 'login',
          username: form.get('username'),
          ...(!forgot ? { password: form.get('password') } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível continuar.');
      if (forgot) setNotice(result.message);
      else onLogin(result.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // A entrada já é a marca: a tinta do logo em volta, o logo claro em cima.
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-brand-ink p-4">
      <BrandLogo className="w-[200px]" onDark priority sizes="200px" />
      <Card className="w-full max-w-sm shadow-xl ring-0">
        {/* O form é o único filho do cartão: o espaço entre cabeçalho e campos vem dele. */}
        <form className="grid gap-5" onSubmit={submit}>
          <CardHeader className="gap-4">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">
                {forgot ? 'Esqueci minha senha' : 'Entre na sua assistência'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {forgot
                  ? 'Informe seu usuário para solicitar uma nova senha ao administrador.'
                  : 'Cada loja possui uma conta e dados separados.'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-username">Usuário</Label>
              <Input
                id="login-username"
                name="username"
                required
                minLength={3}
                maxLength={80}
                autoComplete="username"
                placeholder="Digite seu usuário"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            {!forgot && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    className="pr-10"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 font-sans text-muted-foreground hover:text-foreground"
                    aria-controls="login-password"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p id="login-error" className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p id="login-notice" className="text-sm text-muted-foreground" role="status">
                {notice}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Aguarde...' : forgot ? 'Solicitar ao administrador' : 'Entrar no sistema'}
            </Button>
            <button
              type="button"
              className="font-sans text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                setForgot(!forgot);
                setError('');
                setNotice('');
              }}
            >
              {forgot ? 'Voltar ao login' : 'Esqueci minha senha'}
            </button>
            <small className="text-xs text-muted-foreground">
              {forgot
                ? 'Sua senha só será alterada pelo administrador após confirmar sua identidade.'
                : 'A sessão expira automaticamente após 12 horas.'}
            </small>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}
