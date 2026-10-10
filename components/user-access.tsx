'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
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
import type { LinkDelivery, UserRole } from '@/lib/types';
import { initials, roleHint, roleLabel, whenLabel } from '@/lib/user-labels';

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

/** Sugestão de usuário a partir do e-mail: "marcos.oliveira@x.com" → "marcos.oliveira". */
const usernameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30);

export type NewPerson = { name: string; email: string; username: string; role: UserRole };

/**
 * Cadastro de uma pessoa: nome, e-mail, usuário e papel. Ninguém define a senha
 * de outra pessoa: ela recebe um link e cria a dela.
 */
export function PersonDialog({
  title,
  description,
  emailRequired = false,
  submit,
  close,
}: {
  title: string;
  description: ReactNode;
  emailRequired?: boolean;
  submit: (person: NewPerson) => Promise<void>;
  close: () => void;
}) {
  const [role, setRole] = useState<UserRole>('staff');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await submit({ name: String(form.get('name') || ''), email, username, role });
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
          <div className="grid gap-2">
            <Label htmlFor="person-email">
              E-mail{' '}
              {!emailRequired && (
                <span className="font-normal text-muted-foreground">(opcional)</span>
              )}
            </Label>
            <Input
              autoComplete="off"
              id="person-email"
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (!usernameTouched) setUsername(usernameFromEmail(event.target.value));
              }}
              required={emailRequired}
              type="email"
              value={email}
            />
            <p className="text-xs text-muted-foreground">
              O convite chega por e-mail e a pessoa recupera a senha sozinha. Sem e-mail, você copia
              o link e manda pelo WhatsApp.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="person-username">Usuário de acesso</Label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              id="person-username"
              minLength={3}
              onChange={(event) => {
                setUsername(event.target.value);
                setUsernameTouched(true);
              }}
              pattern="[A-Za-z0-9._\-]+"
              required
              title="Letras, números, ponto, hífen ou sublinhado"
              value={username}
            />
            <p className="text-xs text-muted-foreground">
              A pessoa entra com o usuário ou com o e-mail.
            </p>
          </div>
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
              {saving ? 'Cadastrando…' : 'Cadastrar e convidar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const reasonText: Record<Exclude<LinkDelivery, { sent: true }>['reason'], string> = {
  copy: 'Link novo gerado. O anterior parou de valer.',
  'no-email': 'A pessoa não tem e-mail cadastrado.',
  'not-configured': 'O envio de e-mail ainda não está configurado no sistema.',
  failed: 'O e-mail não pôde ser enviado agora.',
};

/** O link pronto: copiar ou mandar pelo WhatsApp, com o aviso de segurança. */
function LinkBox({
  delivery,
  person,
}: {
  delivery: Extract<LinkDelivery, { sent: false }>;
  person: { name: string; storeName?: string };
}) {
  const [copied, setCopied] = useState(false);
  const message = `Olá, ${person.name.split(' ')[0]}! Este é o seu link para criar a senha e entrar no ReparoSM${person.storeName ? ` (${person.storeName})` : ''}: ${delivery.url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(delivery.url);
      setCopied(true);
    } catch {
      (document.getElementById('access-link-url') as HTMLInputElement | null)?.select();
    }
  };
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {reasonText[delivery.reason]} Mande este link só para {person.name}: quem tiver o link cria
        a senha. Ele vale até {whenLabel(delivery.expiresAt)} e só uma vez.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Link de acesso"
          className="font-mono text-xs"
          id="access-link-url"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={delivery.url}
        />
        <Button onClick={() => void copy()} type="button" variant="outline">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <Button asChild variant="outline">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          rel="noreferrer"
          target="_blank"
        >
          <MessageCircle aria-hidden="true" />
          Mandar pelo WhatsApp
        </a>
      </Button>
    </div>
  );
}

/** Resultado de um convite ou link: enviado por e-mail, ou pronto para copiar. */
export function DeliveryDialog({
  delivery,
  person,
  close,
}: {
  delivery: LinkDelivery;
  person: { name: string; storeName?: string };
  close: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {delivery.sent ? 'Link enviado' : `Link de acesso de ${person.name}`}
          </DialogTitle>
          <DialogDescription>
            {delivery.sent
              ? `Mandamos o link para ${delivery.to}. Se não chegar em alguns minutos, peça para olhar o spam ou gere um link para copiar.`
              : 'A pessoa abre o link, cria a senha e já entra.'}
          </DialogDescription>
        </DialogHeader>
        {!delivery.sent && <LinkBox delivery={delivery} person={person} />}
        <div className="flex justify-end border-t pt-4">
          <Button onClick={close}>Pronto</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gerar um link para copiar (o anterior para de valer). O administrador confirma
 * antes que fala com a pessoa certa.
 */
export function CopyLinkDialog({
  person,
  confirmIdentity = false,
  generate,
  close,
}: {
  person: { name: string; username: string; storeName?: string };
  confirmIdentity?: boolean;
  generate: (identityConfirmed: boolean) => Promise<LinkDelivery>;
  close: () => void;
}) {
  const [delivery, setDelivery] = useState<LinkDelivery | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identity = new FormData(event.currentTarget).get('identity') === 'on';
    setBusy(true);
    setError('');
    try {
      setDelivery(await generate(identity));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  };
  if (delivery) return <DeliveryDialog close={close} delivery={delivery} person={person} />;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md p-0">
        <form className="grid gap-5 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Link de acesso de {person.name}</DialogTitle>
            <DialogDescription>
              Usuário {person.username}. Gera um link novo para a pessoa criar a senha; o anterior
              para de valer. Use quando o e-mail não chegou ou não existe.
            </DialogDescription>
          </DialogHeader>
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
            <Button disabled={busy} onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? 'Gerando…' : 'Gerar link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cadastrar ou corrigir o e-mail de alguém da equipe. */
export function EmailDialog({
  person,
  submit,
  close,
}: {
  person: { name: string; email?: string };
  submit: (email: string) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await submit(String(new FormData(event.currentTarget).get('email') || ''));
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
            <DialogTitle>E-mail de {person.name}</DialogTitle>
            <DialogDescription>
              Com e-mail, a pessoa entra com ele e recupera a senha sozinha. Ele fica confirmado
              quando ela usar um link recebido nele.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="person-new-email">E-mail</Label>
            <Input
              autoComplete="off"
              defaultValue={person.email || ''}
              id="person-new-email"
              inputMode="email"
              name="email"
              type="email"
            />
            <p className="text-xs text-muted-foreground">Deixe em branco para tirar o e-mail.</p>
          </div>
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
              {saving ? 'Salvando…' : 'Salvar e-mail'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
