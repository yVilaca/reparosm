'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PasswordRequest, PublicAccount } from '@/lib/types';

type AccountStatusVariant = 'success' | 'warning' | 'destructive';

function accountStatusVariant(status: string): AccountStatusVariant {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  return 'destructive';
}

function accountStatusLabel(status: string) {
  if (status === 'active') return 'Ativa';
  if (status === 'suspended') return 'Suspensa';
  return 'Cancelada';
}

export default function AccountsRoute({
  initialAccounts,
  initialRequests,
}: {
  initialAccounts: PublicAccount[];
  initialRequests: PasswordRequest[];
}) {
  const { notify, confirm } = useFeedback();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [requests, setRequests] = useState(initialRequests);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const active = accounts.filter((account) => account.status === 'active').length;
  const suspended = accounts.length - active;
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts', { cache: 'no-store' });
      const result = (await response.json()) as {
        error?: string;
        accounts?: PublicAccount[];
        requests?: PasswordRequest[];
      };
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as contas.');
      setAccounts(result.accounts || []);
      setRequests(result.requests || []);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível carregar as contas.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };
  const update = async (account: PublicAccount, status: string) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a conta.');
      notify(status === 'active' ? 'Conta ativada.' : 'Conta atualizada.', 'success');
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível atualizar a conta.',
        'error',
      );
    }
  };
  const remove = async (account: PublicAccount) => {
    if (!(await confirm(`Excluir a conta de ${account.name} e todos os dados dessa loja?`))) return;
    try {
      const response = await fetch(`/api/accounts?id=${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir.');
      notify('Conta excluída.', 'success');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };
  const metrics = [
    { title: 'Total de contas', value: String(accounts.length), detail: 'Incluindo administrador' },
    { title: 'Contas ativas', value: String(active), detail: 'Com acesso liberado' },
    {
      title: 'Suspensas ou canceladas',
      value: String(suspended),
      detail: 'Sem acesso ao sistema',
    },
  ];
  return (
    <>
      <PageHeader
        title="Contas de lojistas"
        description="Gestão administrativa dos ambientes multiempresa."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setModal(true)}>
              Nova conta
            </Button>
          </div>
        }
      />
      <section
        aria-label="Resumo de contas"
        className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {metrics.map((metric) => (
          <Card key={metric.title} size="sm">
            <CardContent className="grid gap-1">
              <p className="text-sm text-muted-foreground">{metric.title}</p>
              <p className="text-2xl font-semibold tabular-nums">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <PasswordRequests accounts={accounts} requests={requests} onChanged={load} />
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Lojistas cadastrados</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada conta visualiza somente os dados da própria assistência.
            </p>
          </div>
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="outline">
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:hidden">
            {accounts.map((account) => (
              <article className="grid gap-2 rounded-lg border p-4" key={account.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong>{account.name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {account.role === 'admin' ? 'Administrador' : 'Lojista'}
                    </p>
                  </div>
                  <Badge variant={accountStatusVariant(account.status)}>
                    {accountStatusLabel(account.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>
                    Usuário: <strong>{account.username}</strong>
                  </p>
                  <p>
                    Plano: <strong>{account.plan || 'Mensal'}</strong>
                  </p>
                  <p className="col-span-2">
                    Vencimento:{' '}
                    <strong>
                      {account.dueDate
                        ? new Date(`${account.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                        : '—'}
                    </strong>
                  </p>
                </div>
                {account.role !== 'admin' && (
                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    <Button
                      onClick={() =>
                        void update(account, account.status === 'active' ? 'suspended' : 'active')
                      }
                      size="sm"
                      variant="outline"
                    >
                      {account.status === 'active' ? 'Suspender' : 'Ativar'}
                    </Button>
                    <Button
                      onClick={() => void update(account, 'cancelled')}
                      size="sm"
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                    <Button onClick={() => void remove(account)} size="sm" variant="destructive">
                      Excluir
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.role === 'admin' ? 'Administrador' : 'Lojista'}
                      </p>
                    </TableCell>
                    <TableCell>{account.username}</TableCell>
                    <TableCell>{account.plan || 'Mensal'}</TableCell>
                    <TableCell>
                      {account.dueDate
                        ? new Date(`${account.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={accountStatusVariant(account.status)}>
                        {accountStatusLabel(account.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {account.role !== 'admin' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              void update(
                                account,
                                account.status === 'active' ? 'suspended' : 'active',
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            {account.status === 'active' ? 'Suspender' : 'Ativar'}
                          </Button>
                          <Button
                            onClick={() => void update(account, 'cancelled')}
                            size="sm"
                            variant="outline"
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={() => void remove(account)}
                            size="sm"
                            variant="destructive"
                          >
                            Excluir
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {modal && (
        <AccountModal
          close={() => setModal(false)}
          saved={async () => {
            setModal(false);
            notify('Nova conta criada com sucesso.', 'success');
            await load();
          }}
        />
      )}
    </>
  );
}

function PasswordRequests({
  accounts,
  requests,
  onChanged,
}: {
  accounts: PublicAccount[];
  requests: PasswordRequest[];
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<PublicAccount | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) {
      setError('As senhas não correspondem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          id: selected.id,
          password: form.get('password'),
          identityConfirmed: form.get('identityConfirmed') === 'on',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível redefinir.');
      setNotice('Senha redefinida. Informe a nova senha ao lojista pelo contato já conhecido.');
      setSelected(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitações de senha ({requests.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirme a identidade pelo contato já cadastrado antes de liberar o acesso.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {requests.length ? (
          <div className="grid gap-2">
            {requests.map((request) => {
              const account = accounts.find((item) => item.id === request.accountId);
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  key={request.id}
                >
                  <div>
                    <strong>{account?.name || request.username}</strong>
                    <p className="text-sm text-muted-foreground">
                      Usuário: {request.username} ·{' '}
                      {new Date(request.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    disabled={!account}
                    onClick={() => {
                      setSelected(account || null);
                      setError('');
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Definir nova senha
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
        )}
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="accounts-reset-select">Redefinir acesso de um lojista</Label>
          <Select
            onValueChange={(value) => {
              setSelected(accounts.find((account) => account.id === value) || null);
              setError('');
            }}
            value={selected?.id ?? ''}
          >
            <SelectTrigger className="w-full" id="accounts-reset-select">
              <SelectValue placeholder="Selecione uma conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((account) => account.role !== 'admin')
                .map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.username})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      {selected && (
        <Dialog open onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-md p-0">
            <form className="grid gap-6 p-6" onSubmit={reset}>
              <DialogHeader>
                <DialogTitle>Nova senha de {selected.name}</DialogTitle>
                <DialogDescription>Usuário: {selected.username}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="accounts-reset-password">Nova senha</Label>
                <Input
                  autoComplete="new-password"
                  id="accounts-reset-password"
                  minLength={10}
                  name="password"
                  required
                  type="password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accounts-reset-confirm">Confirmar senha</Label>
                <Input
                  autoComplete="new-password"
                  id="accounts-reset-confirm"
                  minLength={10}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use pelo menos 10 caracteres, com letras e números.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  className="size-4 shrink-0"
                  id="accounts-reset-confirmed"
                  name="identityConfirmed"
                  required
                  type="checkbox"
                />
                <Label className="font-normal" htmlFor="accounts-reset-confirmed">
                  Confirmei a identidade do lojista pelo contato já conhecido.
                </Label>
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  type="button"
                  variant="outline"
                >
                  Cancelar
                </Button>
                <Button disabled={busy} type="submit">
                  {busy ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function AccountModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState('Mensal');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          username: form.get('username'),
          password: form.get('password'),
          plan,
          dueDate: form.get('dueDate'),
          status: 'active',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar a conta.');
      await saved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conta.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-6 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nova conta de lojista</DialogTitle>
            <DialogDescription>
              Crie um ambiente separado para a nova assistência.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="account-name">Nome da loja ou responsável *</Label>
            <Input id="account-name" name="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-username">Usuário de acesso *</Label>
              <Input
                autoComplete="off"
                id="account-username"
                minLength={3}
                name="username"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-password">Senha inicial *</Label>
              <Input
                autoComplete="new-password"
                id="account-password"
                minLength={10}
                name="password"
                required
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Use no mínimo 10 caracteres, com letras e números.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-plan">Plano</Label>
              <Select onValueChange={setPlan} value={plan}>
                <SelectTrigger className="w-full" id="account-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                  <SelectItem value="Trimestral">Trimestral</SelectItem>
                  <SelectItem value="Anual">Anual</SelectItem>
                  <SelectItem value="Cortesia">Cortesia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-due-date">Próximo vencimento</Label>
              <Input id="account-due-date" name="dueDate" type="date" />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Criando...' : 'Criar conta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
