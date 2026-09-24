'use client';

import { useState, type FormEvent } from 'react';
import type { PublicAccount } from '@/lib/types';

export default function Login({ onLogin }: { onLogin: (account: PublicAccount) => void }) {
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [forgot, setForgot] = useState(false),
    [notice, setNotice] = useState(''),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: forgot ? 'forgot-password' : 'login',
          username: f.get('username'),
          ...(!forgot ? { password: f.get('password') } : {}),
        }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'Não foi possível continuar.');
      if (forgot) setNotice(x.message);
      else onLogin(x.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span>R</span>
          <div>
            <h1>ReparoSM</h1>
            <p>Repair System Master</p>
          </div>
        </div>
        <div className="login-heading">
          <h2>{forgot ? 'Esqueci minha senha' : 'Entre na sua assistência'}</h2>
          <p>
            {forgot
              ? 'Informe seu usuário para solicitar uma nova senha ao administrador.'
              : 'Cada loja possui uma conta e dados separados.'}
          </p>
        </div>
        <label htmlFor="login-username">
          Usuário
          <input
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
        </label>
        {!forgot && (
          <div>
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Digite sua senha"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
            <button
              type="button"
              className="password-toggle"
              aria-controls="login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            </button>
          </div>
        )}
        {error && (
          <p id="login-error" className="login-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p id="login-notice" className="account-notice" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="primary login-submit" disabled={loading}>
          {loading ? 'Aguarde...' : forgot ? 'Solicitar ao administrador' : 'Entrar no sistema'}
        </button>
        <button
          type="button"
          className="logout-button"
          disabled={loading}
          onClick={() => {
            setForgot(!forgot);
            setError('');
            setNotice('');
          }}
        >
          {forgot ? 'Voltar ao login' : 'Esqueci minha senha'}
        </button>
        <small className="first-access">
          {forgot
            ? 'Sua senha só será alterada pelo administrador após confirmar sua identidade.'
            : 'A sessão expira automaticamente após 12 horas.'}
        </small>
      </form>
    </main>
  );
}
