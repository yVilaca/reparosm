'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { PasswordRequest, PublicAccount } from '@/lib/types';

export default function AccountsRoute({
  initialAccounts,
  initialRequests,
}: {
  initialAccounts: PublicAccount[];
  initialRequests: PasswordRequest[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [requests, setRequests] = useState(initialRequests);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
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
      alert(error instanceof Error ? error.message : 'Não foi possível carregar as contas.');
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
      setNotice(status === 'active' ? 'Conta ativada.' : 'Conta atualizada.');
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar a conta.');
    }
  };
  const remove = async (account: PublicAccount) => {
    if (!confirm(`Excluir a conta de ${account.name} e todos os dados dessa loja?`)) return;
    try {
      const response = await fetch(`/api/accounts?id=${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir.');
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir.');
    }
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Contas de lojistas</h1>
          <small>Gestão administrativa dos ambientes multiempresa.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <article className="accounts-hero">
        <div>
          <span>GESTÃO MULTILOJAS</span>
          <h2>Contas dos lojistas</h2>
          <p>
            Crie acessos individuais, acompanhe planos e bloqueie contas com pagamento pendente.
          </p>
        </div>
        <button className="primary" type="button" onClick={() => setModal(true)}>
          + Nova conta
        </button>
      </article>
      <div className="metrics account-metrics">
        <Metric
          title="Total de contas"
          value={String(accounts.length)}
          detail="Incluindo administrador"
        />
        <Metric title="Contas ativas" value={String(active)} detail="Com acesso liberado" />
        <Metric
          title="Suspensas ou canceladas"
          value={String(suspended)}
          detail="Sem acesso ao sistema"
        />
      </div>
      <PasswordRequests accounts={accounts} requests={requests} onChanged={load} />
      <article className="panel accounts-table">
        <div className="panel-head">
          <div>
            <h3>Lojistas cadastrados</h3>
            <p>Cada conta visualiza somente os dados da própria assistência.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        {notice && <p className="account-notice">✓ {notice}</p>}
        <table>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Usuário</th>
              <th>Plano</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <b>{account.name}</b>
                  <small>{account.role === 'admin' ? 'Administrador' : 'Lojista'}</small>
                </td>
                <td>{account.username}</td>
                <td>{account.plan || 'Mensal'}</td>
                <td>
                  {account.dueDate
                    ? new Date(`${account.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
                <td>
                  <span className={`tag ${account.status === 'active' ? 'ready' : 'red'}`}>
                    {account.status === 'active'
                      ? 'Ativa'
                      : account.status === 'suspended'
                        ? 'Suspensa'
                        : 'Cancelada'}
                  </span>
                </td>
                <td>
                  {account.role !== 'admin' && (
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() =>
                          void update(account, account.status === 'active' ? 'suspended' : 'active')
                        }
                      >
                        {account.status === 'active' ? 'Suspender' : 'Ativar'}
                      </button>
                      <button type="button" onClick={() => void update(account, 'cancelled')}>
                        Cancelar
                      </button>
                      <button type="button" className="danger" onClick={() => void remove(account)}>
                        Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      {modal && (
        <AccountModal
          close={() => setModal(false)}
          saved={async () => {
            setModal(false);
            setNotice('Nova conta criada com sucesso.');
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
    <article className="panel recovery-panel">
      <div className="panel-head">
        <div>
          <h3>Solicitações de senha ({requests.length})</h3>
          <p>Confirme a identidade pelo contato já cadastrado antes de liberar o acesso.</p>
        </div>
      </div>
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {requests.length ? (
        requests.map((request) => {
          const account = accounts.find((item) => item.id === request.accountId);
          return (
            <div className="recovery-row" key={request.id}>
              <div>
                <strong>{account?.name || request.username}</strong>
                <p>
                  Usuário: {request.username} ·{' '}
                  {new Date(request.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                type="button"
                disabled={!account}
                onClick={() => {
                  setSelected(account || null);
                  setError('');
                }}
              >
                Definir nova senha
              </button>
            </div>
          );
        })
      ) : (
        <p>Nenhuma solicitação pendente.</p>
      )}
      <label>
        Redefinir acesso de um lojista
        <select
          value=""
          onChange={(event) => {
            setSelected(accounts.find((account) => account.id === event.target.value) || null);
            setError('');
          }}
        >
          <option value="">Selecione uma conta</option>
          {accounts
            .filter((account) => account.role !== 'admin')
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.username})
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={reset}>
            <h2>Nova senha de {selected.name}</h2>
            <p>Usuário: {selected.username}</p>
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirmar senha
              <input
                name="confirmPassword"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
              />
            </label>
            <small>Use pelo menos 10 caracteres, com letras e números.</small>
            <label className="check">
              <input name="identityConfirmed" type="checkbox" required /> Confirmei a identidade do
              lojista pelo contato já conhecido.
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={() => setSelected(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

function AccountModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
          plan: form.get('plan'),
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
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>♙</span>
            <div>
              <h2>Nova conta de lojista</h2>
              <p>Crie um ambiente separado para a nova assistência</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome da loja ou responsável *<input name="name" required />
        </label>
        <div className="form-row">
          <label>
            Usuário de acesso *<input name="username" minLength={3} required autoComplete="off" />
          </label>
          <label>
            Senha inicial *
            <input
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
            <small>Use no mínimo 10 caracteres, com letras e números.</small>
          </label>
        </div>
        <div className="form-row">
          <label>
            Plano
            <select name="plan">
              <option>Mensal</option>
              <option>Trimestral</option>
              <option>Anual</option>
              <option>Cortesia</option>
            </select>
          </label>
          <label>
            Próximo vencimento
            <input name="dueDate" type="date" />
          </label>
        </div>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Criando...' : 'Criar conta'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
