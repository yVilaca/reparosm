'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StoreUser, UserRole } from '@/lib/types';
import { initials, roleHint, roleLabel } from '@/lib/user-labels';

/** Peças de acesso usadas em Minha conta, Equipe e Lojas. */

export function Avatar({ name, muted = false }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
        muted ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
      )}
    >
      {initials(name)}
    </span>
  );
}

/** POST com JSON; erro da API vira exceção com a mensagem dela. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
  return result;
}

export const passwordRule = 'Pelo menos 10 caracteres, com letras e números.';

/** Escolha entre Dono e Funcionário, com o que cada um pode fazer. */
export function RolePicker({
  value,
  onChange,
  name = 'role',
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  name?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Papel</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['staff', 'owner'] as const).map((role) => (
          <label
            className={cn(
              'grid cursor-pointer gap-0.5 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              value === role ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
            )}
            key={role}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                checked={value === role}
                className="size-4"
                name={name}
                onChange={() => onChange(role)}
                type="radio"
                value={role}
              />
              {roleLabel(role)}
            </span>
            <span className="pl-6 text-xs text-muted-foreground">{roleHint[role]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Cadastro de uma pessoa: nome, usuário, senha provisória e papel. Quem cadastra
 * passa o usuário e a senha para a pessoa; ela cria a própria senha ao entrar.
 */
export function PersonDialog({
  title,
  description,
  submit,
  close,
}: {
  title: string;
  description: ReactNode;
  submit: (person: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  close: () => void;
}) {
  const [role, setRole] = useState<UserRole>('staff');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await submit({
        name: String(form.get('name') || ''),
        username: String(form.get('username') || ''),
        password: String(form.get('password') || ''),
        role,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-5 p-6" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="person-name">Nome</Label>
            <Input autoComplete="off" id="person-name" name="name" required minLength={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="person-username">Usuário de acesso</Label>
              <Input
                autoCapitalize="none"
                autoComplete="off"
                id="person-username"
                minLength={3}
                name="username"
                pattern="[A-Za-z0-9._\-]+"
                required
                title="Letras, números, ponto, hífen ou sublinhado"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="person-password">Senha provisória</Label>
              <Input
                autoComplete="new-password"
                id="person-password"
                minLength={10}
                name="password"
                required
                type="password"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {passwordRule} No primeiro acesso, a pessoa cria a própria senha.
          </p>
          <RolePicker onChange={setRole} value={role} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button disabled={saving} onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Cadastrando…' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Senha provisória para alguém que esqueceu a dele. Desconecta a pessoa; no
 * próximo acesso ela cria a própria senha.
 */
export function PasswordDialog({
  user,
  confirmIdentity = false,
  submit,
  close,
}: {
  user: Pick<StoreUser, 'name' | 'username'>;
  /** Administrador: confirmar a identidade pelo contato já conhecido. */
  confirmIdentity?: boolean;
  submit: (password: string, identityConfirmed: boolean) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await submit(String(form.get('password')), form.get('identity') === 'on');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md p-0">
        <form className="grid gap-5 p-6" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Senha provisória de {user.name}</DialogTitle>
            <DialogDescription>
              Usuário {user.username}. A pessoa sai dos aparelhos conectados e cria a própria senha
              no próximo acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="temp-password">Senha provisória</Label>
            <Input
              autoComplete="new-password"
              id="temp-password"
              minLength={10}
              name="password"
              required
              type="password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="temp-password-confirm">Repita a senha</Label>
            <Input
              autoComplete="new-password"
              id="temp-password-confirm"
              minLength={10}
              name="confirm"
              required
              type="password"
            />
            <p className="text-xs text-muted-foreground">{passwordRule}</p>
          </div>
          {confirmIdentity && (
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-0.5 size-4 shrink-0" name="identity" required type="checkbox" />
              Confirmei a identidade da pessoa pelo contato já conhecido.
            </label>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button disabled={saving} onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando…' : 'Definir senha'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
