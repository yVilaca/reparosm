'use client';

import { useState, type FormEvent } from 'react';
import {
  Copy,
  Download,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import QrCode from '@/components/qr-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import IconChip from '@/components/ui/icon-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { postJson } from '@/components/user-access';
import { deviceLabel, whenLabel } from '@/lib/user-labels';
import type { AuthSecurityState } from '@/lib/types';

type Enrollment = { secret: string; uri: string };
type StrongAction = 'regenerate-codes' | 'disable-totp' | 'unlink-google';

function StrongActionForm({
  action,
  label,
  onDone,
}: {
  action: StrongAction;
  label: string;
  onDone: (result: { recoveryCodes?: string[] }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const code = String(data.get('code') || '').trim();
    setSaving(true);
    setError('');
    try {
      const result = await postJson<{ recoveryCodes?: string[] }>('/api/me/security', {
        action,
        currentPassword: data.get('currentPassword'),
        code,
        kind: /^\d{6}$/.test(code.replace(/\s/g, '')) ? 'totp' : 'recovery',
      });
      form.reset();
      await onDone(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a ação.');
    } finally {
      setSaving(false);
    }
  };
  const prefix = `security-${action}`;
  return (
    <details className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-password`}>Senha atual</Label>
          <Input
            autoComplete="current-password"
            id={`${prefix}-password`}
            name="currentPassword"
            required
            type="password"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-code`}>Código do autenticador ou de recuperação</Label>
          <Input
            autoComplete="one-time-code"
            id={`${prefix}-code`}
            inputMode="numeric"
            name="code"
            placeholder="Obrigatório quando o autenticador está ativo"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button disabled={saving} size="sm" type="submit" variant="outline">
            {saving ? 'Confirmando…' : label}
          </Button>
        </div>
      </form>
    </details>
  );
}

export default function AccountSecurity({
  initialSecurity,
  totpAvailable = true,
}: {
  initialSecurity: AuthSecurityState;
  totpAvailable?: boolean;
}) {
  const { confirm, notify } = useFeedback();
  const [security, setSecurity] = useState(initialSecurity);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const otherDevices = security.devices.filter((device) => !device.current);

  const reload = async () => {
    const response = await fetch('/api/me/security', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace('/login');
      return;
    }
    if (!response.ok) return;
    setSecurity(await response.json());
  };

  const startTotp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setStarting(true);
    setStartError('');
    try {
      const next = await postJson<Enrollment>('/api/me/security', {
        action: 'start-totp',
        currentPassword: new FormData(form).get('currentPassword'),
      });
      form.reset();
      setEnrollment(next);
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : 'Não foi possível iniciar.');
    } finally {
      setStarting(false);
    }
  };

  const confirmTotp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setConfirming(true);
    setConfirmError('');
    try {
      const result = await postJson<{ recoveryCodes: string[] }>('/api/me/security', {
        action: 'confirm-totp',
        code: new FormData(form).get('code'),
      });
      setEnrollment(null);
      setRecoveryCodes(result.recoveryCodes);
      await reload();
      notify('Autenticador ativado.', 'success');
    } catch (cause) {
      setConfirmError(cause instanceof Error ? cause.message : 'O código não foi aceito.');
    } finally {
      setConfirming(false);
    }
  };

  const finishStrongAction = async (action: StrongAction, result: { recoveryCodes?: string[] }) => {
    if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
    if (action === 'disable-totp') setRecoveryCodes(null);
    await reload();
    notify(
      action === 'regenerate-codes'
        ? 'Novos códigos gerados. Os anteriores não funcionam mais.'
        : action === 'disable-totp'
          ? 'Autenticador desativado e outros aparelhos desconectados.'
          : 'Conta Google desvinculada.',
      'success',
    );
  };

  const revokeDevice = async (id: string, current: boolean) => {
    if (
      !(await confirm(
        current
          ? 'Remover este aparelho? Você sairá da conta agora.'
          : 'Remover este aparelho e encerrar todas as sessões dele?',
      ))
    )
      return;
    try {
      await postJson('/api/me/security', { action: 'revoke-device', id });
      if (current) window.location.replace('/login');
      else {
        setSecurity((value) => ({
          ...value,
          devices: value.devices.filter((device) => device.id !== id),
        }));
        notify('Aparelho removido.', 'success');
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível remover.', 'error');
    }
  };

  const revokeOthers = async () => {
    if (!(await confirm('Remover todos os outros aparelhos e encerrar as sessões deles?'))) return;
    try {
      await postJson('/api/me/security', { action: 'revoke-other-devices' });
      setSecurity((value) => ({
        ...value,
        devices: value.devices.filter((device) => device.current),
      }));
      notify('Pronto: só este aparelho continua autorizado.', 'success');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível remover.', 'error');
    }
  };

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    notify('Códigos copiados.', 'success');
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const url = URL.createObjectURL(
      new Blob([`ReparoSM — códigos de recuperação\n\n${recoveryCodes.join('\n')}\n`], {
        type: 'text/plain',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reparosm-codigos-recuperacao.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="account-security-title" className="mt-8 grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold" id="account-security-title">
            Segurança da conta
          </h2>
          <p className="text-sm text-muted-foreground">
            Login Google, autenticador, códigos de recuperação e aparelhos autorizados.
          </p>
        </div>
        {!security.totpEnabled && totpAvailable && <Badge variant="secondary">Recomendado</Badge>}
      </header>

      {recoveryCodes && (
        <Card className="border-primary/30 bg-primary/[0.03] print:border-foreground">
          <CardHeader>
            <CardTitle>Guarde estes códigos agora</CardTitle>
            <CardDescription>
              Eles aparecem uma única vez. Cada código substitui o autenticador em um acesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
              {recoveryCodes.map((code) => (
                <li className="rounded-md border bg-background px-3 py-2 text-center" key={code}>
                  {code}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button onClick={() => void copyCodes()} size="sm" type="button" variant="outline">
                <Copy aria-hidden="true" /> Copiar
              </Button>
              <Button onClick={downloadCodes} size="sm" type="button" variant="outline">
                <Download aria-hidden="true" /> Baixar .txt
              </Button>
              <Button onClick={() => window.print()} size="sm" type="button" variant="outline">
                <Printer aria-hidden="true" /> Imprimir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconChip icon={ShieldCheck} tone={security.totpEnabled ? 'success' : 'neutral'} />
              <div>
                <CardTitle>Autenticador</CardTitle>
                <CardDescription>
                  {security.totpEnabled
                    ? `${security.recoveryCodesRemaining} códigos disponíveis.`
                    : 'Ative o autenticador para proteger seu acesso além da senha.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!totpAvailable ? (
              <p className="text-sm text-muted-foreground">
                O autenticador não está disponível neste ambiente.
              </p>
            ) : enrollment ? (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <QrCode
                    className="aspect-square w-36 rounded-lg ring-1 ring-foreground/10"
                    label="QR para configurar o autenticador"
                    value={enrollment.uri}
                  />
                  <div className="grid gap-2 text-sm">
                    <p>Leia o QR no Google Authenticator ou em outro aplicativo compatível.</p>
                    <p className="text-muted-foreground">Chave manual</p>
                    <code className="break-all rounded-md bg-muted px-3 py-2">
                      {enrollment.secret}
                    </code>
                  </div>
                </div>
                <form className="grid gap-3" onSubmit={confirmTotp}>
                  <div className="grid gap-2">
                    <Label htmlFor="security-first-code">Primeiro código de 6 dígitos</Label>
                    <Input
                      autoComplete="one-time-code"
                      id="security-first-code"
                      inputMode="numeric"
                      maxLength={6}
                      name="code"
                      pattern="[0-9]{6}"
                      required
                    />
                  </div>
                  {confirmError && (
                    <p className="text-sm text-destructive" role="alert">
                      {confirmError}
                    </p>
                  )}
                  <div>
                    <Button disabled={confirming} type="submit">
                      {confirming ? 'Conferindo…' : 'Confirmar e ativar'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : security.totpEnabled ? (
              <div className="grid gap-3">
                <StrongActionForm
                  action="regenerate-codes"
                  label="Gerar novos códigos"
                  onDone={(result) => finishStrongAction('regenerate-codes', result)}
                />
                <StrongActionForm
                  action="disable-totp"
                  label="Desativar autenticador"
                  onDone={(result) => finishStrongAction('disable-totp', result)}
                />
              </div>
            ) : (
              <form className="grid gap-3" onSubmit={startTotp}>
                <div className="grid gap-2">
                  <Label htmlFor="security-start-password">Confirme sua senha atual</Label>
                  <Input
                    autoComplete="current-password"
                    id="security-start-password"
                    name="currentPassword"
                    required
                    type="password"
                  />
                </div>
                {startError && (
                  <p className="text-sm text-destructive" role="alert">
                    {startError}
                  </p>
                )}
                <div>
                  <Button disabled={starting} type="submit">
                    <KeyRound aria-hidden="true" />
                    {starting ? 'Preparando…' : 'Ativar autenticador'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login com Google</CardTitle>
            <CardDescription>
              {security.googleIdentity
                ? `Vinculado a ${security.googleIdentity.email}.`
                : 'Não vinculado. Entre com Google usando seu e-mail confirmado para vincular.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {security.googleIdentity ? (
              <StrongActionForm
                action="unlink-google"
                label="Desvincular Google"
                onDone={(result) => finishStrongAction('unlink-google', result)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Sua senha continua sendo uma forma independente de acesso.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Aparelhos</CardTitle>
            <CardDescription>
              Remover um aparelho encerra suas sessões e apaga a confiança concedida.
            </CardDescription>
          </div>
          {otherDevices.length > 0 && (
            <Button onClick={() => void revokeOthers()} size="sm" type="button" variant="outline">
              <LogOut aria-hidden="true" /> Sair dos outros aparelhos
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {security.devices.length ? (
            <ul className="divide-y rounded-xl border">
              {security.devices.map((device) => (
                <li className="flex flex-wrap items-center gap-3 px-4 py-3" key={device.id}>
                  <IconChip icon={MonitorSmartphone} tone={device.current ? 'brand' : 'neutral'} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {deviceLabel(device.userAgent)}
                      {device.current && <Badge variant="secondary">Este aparelho</Badge>}
                      {device.sessions > 1 && (
                        <Badge variant="neutral">{device.sessions} sessões</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Visto {whenLabel(device.lastSeenAt)}
                      {device.ip && device.ip !== 'unknown' ? ` · IP ${device.ip}` : ''}
                    </p>
                    {device.trustedUntil && (
                      <p className="text-xs text-muted-foreground">
                        Confiável até {whenLabel(device.trustedUntil)}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => void revokeDevice(device.id, device.current)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum aparelho autorizado.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
