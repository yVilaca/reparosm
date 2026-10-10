'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, MailCheck, MonitorSmartphone } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import IconChip from '@/components/ui/icon-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import SoftBanner from '@/components/ui/soft-banner';
import { passwordRule, postJson } from '@/components/user-access';
import { deviceLabel, roleLabel, whenLabel } from '@/lib/user-labels';
import type { StoreSession, StoreUser } from '@/lib/types';

/** Minha conta: nome, e-mail, senha e aparelhos conectados de quem está usando. */
export default function MyAccountRoute({
  storeName,
  initialUser,
  initialSessions,
  initialPendingEmail,
  emailEnabled,
}: {
  storeName: string;
  initialUser: StoreUser;
  initialSessions: StoreSession[];
  /** E-mail novo esperando a confirmação pelo link. */
  initialPendingEmail: { email: string; expiresAt: string } | null;
  emailEnabled: boolean;
}) {
  const { notify, confirm } = useFeedback();
  const [user, setUser] = useState(initialUser);
  const [sessions, setSessions] = useState(initialSessions);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [pending, setPending] = useState(initialPendingEmail);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const others = sessions.filter((session) => !session.current);

  const reload = async () => {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) return;
    const result = (await response.json()) as {
      user: StoreUser;
      sessions: StoreSession[];
      pendingEmail: { email: string; expiresAt: string } | null;
    };
    setUser(result.user);
    setSessions(result.sessions);
    setPending(result.pendingEmail);
  };

  // O e-mail novo só vale depois do clique no link que chega nele.
  const changeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSavingEmail(true);
    setEmailError('');
    try {
      const result = await postJson<{ pendingEmail: { email: string; expiresAt: string } }>(
        '/api/me',
        { action: 'email', email: form.get('email'), currentPassword: form.get('currentPassword') },
      );
      formElement.reset();
      setPending(result.pendingEmail);
      notify('Mandamos um link de confirmação para o e-mail novo.', 'success');
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : 'Não foi possível trocar o e-mail.');
    } finally {
      setSavingEmail(false);
    }
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingName(true);
    try {
      const name = String(new FormData(event.currentTarget).get('name') || '');
      const result = await postJson<{ user: StoreUser }>('/api/me', { action: 'profile', name });
      setUser(result.user);
      notify('Nome atualizado.', 'success');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get('password') !== form.get('confirm')) {
      setPasswordError('As senhas novas não conferem.');
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      await postJson('/api/me', {
        action: 'password',
        currentPassword: form.get('currentPassword'),
        password: form.get('password'),
      });
      formElement.reset();
      notify('Senha trocada. Os outros aparelhos foram desconectados.', 'success');
      await reload();
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : 'Não foi possível trocar a senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const endSession = async (session: StoreSession) => {
    try {
      await postJson('/api/me', { action: 'end-session', id: session.id });
      setSessions((current) => current.filter((item) => item.id !== session.id));
      notify('Aparelho desconectado.', 'success');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível desconectar.', 'error');
    }
  };

  const endOthers = async () => {
    if (
      !(await confirm(
        `Sair de ${others.length === 1 ? '1 outro aparelho' : `${others.length} outros aparelhos`}?`,
      ))
    )
      return;
    try {
      await postJson('/api/me', { action: 'end-other-sessions' });
      setSessions((current) => current.filter((item) => item.current));
      notify('Pronto: só este aparelho continua conectado.', 'success');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível desconectar.', 'error');
    }
  };

  return (
    <>
      <PageHeader title="Minha conta" description={`Seu acesso a ${storeName}.`} />
      {user.mustChangePassword && (
        <SoftBanner
          className="mb-6"
          description="Ela foi definida por outra pessoa. Crie a sua abaixo para continuar com segurança."
          icon={KeyRound}
          title="Você está usando uma senha provisória"
          tone="warning"
        />
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>Como você aparece para a equipe.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={saveName}>
              <div className="grid gap-2">
                <Label htmlFor="me-name">Nome</Label>
                <Input defaultValue={user.name} id="me-name" minLength={2} name="name" required />
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Usuário de acesso</dt>
                  <dd className="font-medium">{user.username}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Papel</dt>
                  <dd className="font-medium">{roleLabel(user.role)}</dd>
                </div>
              </dl>
              <div>
                <Button disabled={savingName} type="submit" variant="outline">
                  {savingName ? 'Salvando…' : 'Salvar nome'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card id="email">
          <CardHeader>
            <CardTitle>E-mail</CardTitle>
            <CardDescription>
              Com e-mail, você entra com ele e recupera a senha sozinho quando precisar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {user.email ? (
                <>
                  <span className="font-medium break-all">{user.email}</span>
                  <Badge variant={user.emailVerified ? 'success' : 'neutral'}>
                    {user.emailVerified ? 'Confirmado' : 'Não confirmado'}
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground">Nenhum e-mail cadastrado.</span>
              )}
            </div>
            {pending && (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                <MailCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Falta confirmar <strong className="break-all">{pending.email}</strong>: abra o
                  e-mail e clique em Confirmar. O link vale até {whenLabel(pending.expiresAt)}.
                </span>
              </p>
            )}
            {emailEnabled ? (
              <form className="grid gap-4" onSubmit={changeEmail}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="me-email">{user.email ? 'Novo e-mail' : 'E-mail'}</Label>
                    <Input
                      autoComplete="email"
                      id="me-email"
                      inputMode="email"
                      name="email"
                      required
                      type="email"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="me-email-password">Sua senha</Label>
                    <Input
                      autoComplete="current-password"
                      id="me-email-password"
                      name="currentPassword"
                      required
                      type="password"
                    />
                  </div>
                </div>
                {emailError && (
                  <p className="text-sm text-destructive" role="alert">
                    {emailError}
                  </p>
                )}
                <div>
                  <Button disabled={savingEmail} type="submit" variant="outline">
                    {savingEmail ? 'Enviando…' : 'Enviar confirmação'}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                O envio de e-mail ainda não está ligado. Por enquanto,{' '}
                {user.role === 'owner'
                  ? 'peça ao suporte ReparoSM para cadastrar o seu e-mail.'
                  : 'peça ao dono da loja para cadastrar o seu e-mail em Equipe.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card id="senha">
          <CardHeader>
            <CardTitle>Senha</CardTitle>
            <CardDescription>
              Ao trocar, os outros aparelhos conectados com o seu usuário saem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={changePassword}>
              <div className="grid gap-2">
                <Label htmlFor="me-current-password">
                  {user.mustChangePassword ? 'Senha provisória' : 'Senha atual'}
                </Label>
                <Input
                  autoComplete="current-password"
                  id="me-current-password"
                  name="currentPassword"
                  required
                  type="password"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="me-new-password">Nova senha</Label>
                  <Input
                    autoComplete="new-password"
                    id="me-new-password"
                    minLength={10}
                    name="password"
                    required
                    type="password"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="me-confirm-password">Repita a nova senha</Label>
                  <Input
                    autoComplete="new-password"
                    id="me-confirm-password"
                    minLength={10}
                    name="confirm"
                    required
                    type="password"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{passwordRule}</p>
              {passwordError && (
                <p className="text-sm text-destructive" role="alert">
                  {passwordError}
                </p>
              )}
              <div>
                <Button disabled={savingPassword} type="submit">
                  {savingPassword ? 'Trocando…' : 'Trocar senha'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="devices-title" className="mt-6 grid gap-2">
        <header className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold" id="devices-title">
              Aparelhos conectados
              <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                {sessions.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Cada aparelho fica conectado por 12 horas. Entrar em um não desconecta os outros.
            </p>
          </div>
          {others.length > 0 && (
            <Button onClick={() => void endOthers()} size="sm" variant="outline">
              <LogOut aria-hidden="true" />
              Sair dos outros aparelhos
            </Button>
          )}
        </header>
        <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          {sessions.map((session) => (
            <li className="flex flex-wrap items-center gap-3 px-4 py-3" key={session.id}>
              <IconChip icon={MonitorSmartphone} tone={session.current ? 'brand' : 'neutral'} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {deviceLabel(session.userAgent)}
                  {session.current && <Badge variant="secondary">Este aparelho</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  Entrou {whenLabel(session.createdAt)}
                  {session.ip && session.ip !== 'unknown' ? ` · IP ${session.ip}` : ''}
                </p>
              </div>
              {!session.current && (
                <Button onClick={() => void endSession(session)} size="sm" variant="ghost">
                  Desconectar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
