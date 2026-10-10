'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  CalendarClock,
  CalendarX,
  KeyRound,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Store,
} from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import TeamList, { type TeamApi } from '@/components/team-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import EmptyState from '@/components/ui/empty-state';
import FilterPills from '@/components/ui/filter-pills';
import IconChip from '@/components/ui/icon-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import RecordDialog, {
  RecordField,
  RecordForm,
  RecordSection,
} from '@/components/ui/record-dialog';
import RowMenu from '@/components/ui/row-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StatCard, { StatGroup } from '@/components/ui/stat-card';
import { toneText, type Tone } from '@/components/ui/tone';
import { Avatar, CopyLinkDialog, DeliveryDialog, postJson } from '@/components/user-access';
import { lastAccessLabel, whenLabel } from '@/lib/user-labels';
import type { AdminStore } from '@/lib/repos/accounts';
import type {
  AccountStatus,
  LinkDelivery,
  PasswordRequest,
  StoreUser,
  TeamMember,
} from '@/lib/types';

const PLANS = ['Mensal', 'Trimestral', 'Anual', 'Cortesia'] as const;
const SOON_DAYS = 7;

const statusLabel: Record<AccountStatus, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
};

/** Hoje em São Paulo, como AAAA-MM-DD. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const daysUntil = (date: string) =>
  Math.round((Date.parse(date) - Date.parse(today())) / (24 * 60 * 60 * 1000));
const brDate = (date: string) => date.split('-').reverse().join('/');
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const people = (count: number) => (count === 1 ? '1 pessoa' : `${count} pessoas`);

type Due = 'overdue' | 'soon' | 'ok' | 'none';

/** Situação do vencimento: só pesa para loja ativa e com plano que vence. */
function dueOf(store: AdminStore): Due {
  if (store.plan === 'Cortesia' || !store.dueDate) return 'none';
  const days = daysUntil(store.dueDate);
  return days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'ok';
}

function dueLabel(store: AdminStore) {
  if (store.plan === 'Cortesia') return 'Cortesia, sem vencimento';
  if (!store.dueDate) return 'Sem vencimento';
  const days = daysUntil(store.dueDate);
  if (days < 0) return days === -1 ? 'Venceu ontem' : `Venceu há ${-days} dias`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  return `Vence ${brDate(store.dueDate)}`;
}

const dueTone: Record<Due, Tone | undefined> = {
  overdue: 'danger',
  soon: 'warning',
  ok: undefined,
  none: undefined,
};

function storeTone(store: AdminStore): Tone {
  if (store.status !== 'active') return 'neutral';
  const due = dueOf(store);
  return due === 'overdue' ? 'danger' : due === 'soon' ? 'warning' : 'success';
}

type Filter = 'all' | 'overdue' | 'soon' | 'active' | 'suspended' | 'cancelled';

const matches = (store: AdminStore, filter: Filter) => {
  if (filter === 'all') return true;
  if (filter === 'suspended' || filter === 'cancelled') return store.status === filter;
  if (store.status !== 'active') return false;
  return filter === 'active' || dueOf(store) === filter;
};

/** Mais urgente primeiro: vencidas, vencendo, ativas, suspensas, canceladas. */
const urgency = (store: AdminStore) =>
  store.status === 'active'
    ? { overdue: 0, soon: 1, ok: 2, none: 2 }[dueOf(store)]
    : store.status === 'suspended'
      ? 3
      : 4;

/** Lojas: assinatura, acesso e equipe de cada assistência que usa o ReparoSM. */
export default function AccountsRoute({
  initialStores,
  initialRequests,
}: {
  initialStores: AdminStore[];
  initialRequests: PasswordRequest[];
}) {
  const { notify, confirm } = useFeedback();
  const [stores, setStores] = useState(initialStores);
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [linking, setLinking] = useState<PasswordRequest | null>(null);
  const [delivered, setDelivered] = useState<{
    delivery: LinkDelivery;
    name: string;
    storeName: string;
  } | null>(null);

  const load = async () => {
    const response = await fetch('/api/accounts', { cache: 'no-store' });
    const result = (await response.json()) as {
      error?: string;
      stores?: AdminStore[];
      requests?: PasswordRequest[];
    };
    if (!response.ok) {
      notify(result.error || 'Não foi possível carregar as lojas.', 'error');
      return;
    }
    setStores(result.stores || []);
    setRequests(result.requests || []);
  };

  const act = async (body: object, done: string) => {
    try {
      await postJson('/api/accounts', body);
      notify(done, 'success');
      await load();
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível salvar.', 'error');
      return false;
    }
  };

  const renew = (store: AdminStore) =>
    act({ action: 'renew', id: store.id }, `${store.name} renovada.`);
  const setStatus = async (store: AdminStore, status: AccountStatus) => {
    if (
      status !== 'active' &&
      !(await confirm(
        `${status === 'suspended' ? 'Suspender' : 'Cancelar'} ${store.name}? Todos da loja saem do sistema na hora.`,
      ))
    )
      return;
    await act(
      { id: store.id, status },
      status === 'active'
        ? `${store.name} reativada.`
        : `${store.name} ${statusLabel[status].toLowerCase()}.`,
    );
  };
  const remove = async (store: AdminStore) => {
    if (
      !(await confirm(
        `Excluir ${store.name} e TODOS os dados da loja (ordens, clientes, caixa, estoque)? Não dá para desfazer.`,
      ))
    )
      return;
    const response = await fetch(`/api/accounts?id=${encodeURIComponent(store.id)}`, {
      method: 'DELETE',
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      notify(result.error || 'Não foi possível excluir.', 'error');
      return;
    }
    setViewingId(null);
    notify(`${store.name} foi excluída.`, 'success');
    await load();
  };

  const active = stores.filter((store) => store.status === 'active');
  const count = (filter: Filter) => stores.filter((store) => matches(store, filter)).length;
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase();
    return stores
      .filter((store) => matches(store, filter))
      .filter(
        (store) =>
          !words ||
          [store.name, store.ownerName, store.ownerUsername, store.username]
            .join(' ')
            .toLowerCase()
            .includes(words),
      )
      .sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [stores, filter, query]);
  const viewing = stores.find((store) => store.id === viewingId) || null;

  const menu = (store: AdminStore, inRecord = false) => (
    <RowMenu label={store.name}>
      {!inRecord && (
        <DropdownMenuItem onSelect={() => setViewingId(store.id)}>Abrir ficha</DropdownMenuItem>
      )}
      {store.plan !== 'Cortesia' && (
        <DropdownMenuItem onSelect={() => void renew(store)}>Renovar</DropdownMenuItem>
      )}
      {store.status === 'active' ? (
        <DropdownMenuItem onSelect={() => void setStatus(store, 'suspended')}>
          Suspender
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem onSelect={() => void setStatus(store, 'active')}>
          Reativar
        </DropdownMenuItem>
      )}
      {store.status !== 'cancelled' && (
        <DropdownMenuItem onSelect={() => void setStatus(store, 'cancelled')}>
          Cancelar assinatura
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void remove(store)} variant="destructive">
        Excluir loja
      </DropdownMenuItem>
    </RowMenu>
  );

  return (
    <>
      <PageHeader
        title="Lojas"
        description="As assistências que usam o ReparoSM: assinatura, acesso e equipe de cada uma."
        action={
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Nova loja
          </Button>
        }
      />
      <StatGroup aria-label="Resumo das lojas" className="mb-6 grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail={`${people(active.reduce((sum, store) => sum + store.users, 0))} com acesso`}
          icon={Store}
          label="Ativas"
          tone="success"
          value={active.length}
        />
        <StatCard
          detail={`Nos próximos ${SOON_DAYS} dias`}
          icon={CalendarClock}
          label="Vencendo"
          tone="warning"
          value={count('soon')}
        />
        <StatCard
          detail="Renove ou suspenda"
          icon={CalendarX}
          label="Vencidas"
          tone="danger"
          value={count('overdue')}
          valueTone={count('overdue') ? 'danger' : undefined}
        />
        <StatCard
          detail="Sem acesso ao sistema"
          icon={PauseCircle}
          label="Suspensas ou canceladas"
          value={stores.length - active.length}
        />
      </StatGroup>

      {requests.length > 0 && (
        <div className="mb-6">
          <ListGroup count={requests.length} title="Donos que pediram senha nova">
            {requests.map((request) => (
              <ListRow
                actions={
                  <Button onClick={() => setLinking(request)} size="sm">
                    <KeyRound aria-hidden="true" />
                    Gerar link de nova senha
                  </Button>
                }
                details={`${request.storeName} · ${request.username} · sem e-mail · pediu ${whenLabel(request.createdAt)}`}
                key={request.id}
                leading={<Avatar name={request.name} />}
                title={request.name}
              />
            ))}
          </ListGroup>
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:flex lg:items-center lg:justify-between">
        <FilterPills<Filter>
          label="Mostrar"
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas', count: stores.length },
            { value: 'overdue', label: 'Vencidas', count: count('overdue') },
            { value: 'soon', label: 'Vencendo', count: count('soon') },
            { value: 'active', label: 'Ativas', count: active.length },
            { value: 'suspended', label: 'Suspensas', count: count('suspended') },
            { value: 'cancelled', label: 'Canceladas', count: count('cancelled') },
          ]}
          value={filter}
        />
        <div className="relative lg:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar loja, dono ou usuário"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar loja, dono ou usuário"
            type="search"
            value={query}
          />
        </div>
      </div>

      {visible.length ? (
        <ListGroup count={visible.length} title="Lojas">
          {visible.map((store) => {
            const due = dueOf(store);
            const renewable = store.status === 'active' && (due === 'overdue' || due === 'soon');
            return (
              <ListRow
                actions={
                  <>
                    {renewable && (
                      <Button onClick={() => void renew(store)} size="sm" variant="outline">
                        <RefreshCw aria-hidden="true" />
                        Renovar
                      </Button>
                    )}
                    {menu(store)}
                  </>
                }
                details={`${store.ownerName || 'Sem dono'} · ${store.ownerEmail || store.ownerUsername || '—'} · ${people(store.users)}`}
                key={store.id}
                leading={<IconChip icon={Store} tone={storeTone(store)} />}
                note={
                  store.status !== 'active'
                    ? statusLabel[store.status]
                    : store.ownerAccess === 'invited'
                      ? 'Convite pendente, o dono ainda não entrou'
                      : store.ownerAccess === 'invite-expired'
                        ? 'Convite do dono venceu'
                        : lastAccessLabel(store.lastLoginAt)
                }
                noteTone={
                  store.status !== 'active'
                    ? 'neutral'
                    : store.ownerAccess === 'invite-expired'
                      ? 'warning'
                      : undefined
                }
                onOpen={() => setViewingId(store.id)}
                openLabel={`Abrir ${store.name}`}
                title={store.name}
                value={dueLabel(store)}
                valueClassName={
                  store.status === 'active' && dueTone[due]
                    ? toneText[dueTone[due] as Tone]
                    : 'font-medium text-muted-foreground'
                }
              />
            );
          })}
        </ListGroup>
      ) : (
        <EmptyState
          action={
            filter !== 'all' || query ? (
              <Button
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
                variant="outline"
              >
                Mostrar todas
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>Nova loja</Button>
            )
          }
          description={
            stores.length
              ? 'Nenhuma loja com esse filtro ou busca.'
              : 'Cadastre a primeira assistência: o dono recebe um convite para criar a senha.'
          }
          title={stores.length ? 'Nada por aqui' : 'Nenhuma loja ainda'}
        />
      )}

      {creating && (
        <NewStoreDialog
          close={() => setCreating(false)}
          created={async (result) => {
            setCreating(false);
            notify(`${result.storeName} foi criada.`, 'success');
            setDelivered(result);
            await load();
          }}
        />
      )}
      {viewing && (
        <StoreRecord
          close={() => setViewingId(null)}
          key={viewing.id}
          menu={menu(viewing, true)}
          onChanged={load}
          onRenew={() => void renew(viewing)}
          onStatus={(status) => void setStatus(viewing, status)}
          store={viewing}
        />
      )}
      {linking && (
        <CopyLinkDialog
          close={() => {
            setLinking(null);
            void load();
          }}
          confirmIdentity
          generate={async (identityConfirmed) =>
            (
              await postJson<{ invite: LinkDelivery }>('/api/accounts', {
                action: 'copy-link',
                userId: linking.userId,
                identityConfirmed,
              })
            ).invite
          }
          person={linking}
        />
      )}
      {delivered && (
        <DeliveryDialog
          close={() => setDelivered(null)}
          delivery={delivered.delivery}
          person={{ name: delivered.name, storeName: delivered.storeName }}
        />
      )}
    </>
  );
}

/** Ficha da loja: assinatura (editável) e as pessoas com acesso. */
function StoreRecord({
  store,
  close,
  menu,
  onChanged,
  onRenew,
  onStatus,
}: {
  store: AdminStore;
  close: () => void;
  menu: ReactNode;
  onChanged: () => Promise<void>;
  onRenew: () => void;
  onStatus: (status: AccountStatus) => void;
}) {
  const { notify } = useFeedback();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const due = dueOf(store);

  const fetchMembers = async () => {
    const response = await fetch(`/api/accounts?id=${encodeURIComponent(store.id)}`, {
      cache: 'no-store',
    });
    const result = (await response.json()) as { users?: TeamMember[]; error?: string };
    if (!response.ok) notify(result.error || 'Não foi possível carregar a equipe.', 'error');
    return result.users || [];
  };
  const loadMembers = async () => setMembers(await fetchMembers());
  // A equipe chega ao abrir a ficha; depois, cada mudança recarrega por onChanged.
  useEffect(() => {
    let open = true;
    void fetchMembers().then((users) => open && setMembers(users));
    return () => {
      open = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  const admin = <T,>(body: object) => postJson<T>('/api/accounts', body);
  const api: TeamApi = {
    create: async (person) =>
      (
        await admin<{ invite: LinkDelivery | null }>({
          action: 'add-user',
          id: store.id,
          ...person,
        })
      ).invite,
    update: async (userId, changes) =>
      void (await admin({ action: 'update-user', id: store.id, userId, ...changes })),
    setEmail: async (userId, email) =>
      void (await admin<{ user: StoreUser }>({ action: 'set-email', id: store.id, userId, email })),
    sendLink: async (userId) =>
      (await admin<{ invite: LinkDelivery }>({ action: 'send-link', userId })).invite,
    copyLink: async (userId, identityConfirmed) =>
      (await admin<{ invite: LinkDelivery }>({ action: 'copy-link', userId, identityConfirmed }))
        .invite,
    disconnect: async (userId) =>
      void (await admin({ action: 'disconnect-user', id: store.id, userId })),
  };

  return (
    <RecordDialog
      actions={
        <>
          {store.status === 'active' ? (
            <Button onClick={() => onStatus('suspended')} variant="outline">
              Suspender
            </Button>
          ) : (
            <Button onClick={() => onStatus('active')} variant="outline">
              Reativar
            </Button>
          )}
          {menu}
        </>
      }
      badge={
        <Badge variant={store.status === 'active' ? 'success' : 'neutral'}>
          {statusLabel[store.status]}
        </Badge>
      }
      className="max-w-3xl"
      close={close}
      description={`Dono: ${store.ownerName || '—'} (${store.ownerEmail || store.ownerUsername || '—'})`}
      editLabel="Editar assinatura"
      primary={
        store.plan !== 'Cortesia' && (
          <Button onClick={onRenew}>
            <RefreshCw aria-hidden="true" />
            Renovar
          </Button>
        )
      }
      renderEdit={(controls) => (
        <SubscriptionForm
          markDirty={controls.markDirty}
          onCancel={controls.cancel}
          saved={async () => {
            controls.saved();
            await onChanged();
          }}
          store={store}
        />
      )}
      title={store.name}
    >
      <div className="grid gap-6">
        <RecordSection columns={3} title="Assinatura">
          <RecordField label="Plano">{store.plan || 'Mensal'}</RecordField>
          <RecordField label="Vencimento">
            <span
              className={
                dueTone[due] && store.status === 'active' ? toneText[dueTone[due] as Tone] : ''
              }
            >
              {dueLabel(store)}
            </span>
          </RecordField>
          <RecordField label="Situação">{statusLabel[store.status]}</RecordField>
          <RecordField label="Cliente desde">{dateLabel(store.createdAt)}</RecordField>
          <RecordField label="Último acesso">
            {store.lastLoginAt ? whenLabel(store.lastLoginAt) : 'Ainda não entrou'}
          </RecordField>
          <RecordField label="Identificador">{store.username}</RecordField>
        </RecordSection>
        <section aria-label="Equipe da loja" className="grid gap-3">
          <h3 className="font-semibold">Equipe da loja</h3>
          {members ? (
            <TeamList
              addLabel="Adicionar pessoa"
              api={api}
              confirmIdentity
              members={members}
              onChanged={async () => {
                await loadMembers();
                await onChanged();
              }}
              storeName={store.name}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
        </section>
      </div>
    </RecordDialog>
  );
}

function SubscriptionForm({
  store,
  onCancel,
  saved,
  markDirty,
}: {
  store: AdminStore;
  onCancel: () => void;
  saved: () => Promise<void>;
  markDirty: () => void;
}) {
  const { notify } = useFeedback();
  const [name, setName] = useState(store.name);
  const [plan, setPlan] = useState(store.plan || 'Mensal');
  const [dueDate, setDueDate] = useState(store.dueDate || '');
  const [saving, setSaving] = useState(false);
  return (
    <RecordForm
      markDirty={markDirty}
      onCancel={onCancel}
      onSubmit={async () => {
        setSaving(true);
        try {
          await postJson('/api/accounts', {
            id: store.id,
            name,
            plan,
            dueDate: plan === 'Cortesia' ? '' : dueDate,
          });
          notify('Assinatura atualizada.', 'success');
          await saved();
        } catch (cause) {
          notify(cause instanceof Error ? cause.message : 'Não foi possível salvar.', 'error');
          setSaving(false);
        }
      }}
      saving={saving}
      submitLabel="Salvar"
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="store-name">Nome da loja</Label>
          <Input
            id="store-name"
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="store-plan">Plano</Label>
            <Select
              onValueChange={(value) => {
                setPlan(value);
                markDirty();
              }}
              value={plan}
            >
              <SelectTrigger className="w-full" id="store-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-due">Vencimento</Label>
            <Input
              disabled={plan === 'Cortesia'}
              id="store-due"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </div>
        </div>
      </div>
    </RecordForm>
  );
}

function NewStoreDialog({
  close,
  created,
}: {
  close: () => void;
  created: (result: { delivery: LinkDelivery; name: string; storeName: string }) => Promise<void>;
}) {
  const [plan, setPlan] = useState('Mensal');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      const result = await postJson<{ invite: LinkDelivery }>('/api/accounts', {
        name: form.get('name'),
        ownerName: form.get('ownerName'),
        ownerEmail: form.get('ownerEmail'),
        username: form.get('username'),
        plan,
        dueDate: plan === 'Cortesia' ? '' : form.get('dueDate'),
      });
      await created({
        delivery: result.invite,
        name: String(form.get('ownerName')),
        storeName: String(form.get('name')),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a loja.');
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-5 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nova loja</DialogTitle>
            <DialogDescription>
              Cria o ambiente da assistência e manda ao dono um convite para criar a senha e entrar.
              Depois o dono cadastra a equipe dele.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-store-name">Nome da loja</Label>
            <Input id="new-store-name" minLength={2} name="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-store-owner">Nome do dono</Label>
              <Input id="new-store-owner" minLength={2} name="ownerName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-store-email">E-mail do dono</Label>
              <Input
                autoComplete="off"
                id="new-store-email"
                inputMode="email"
                name="ownerEmail"
                required
                type="email"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-store-username">
              Usuário do dono <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              id="new-store-username"
              minLength={3}
              name="username"
              pattern="[A-Za-z0-9._\-]+"
              title="Letras, números, ponto, hífen ou sublinhado"
            />
            <p className="text-xs text-muted-foreground">
              Em branco, criamos a partir do e-mail. O dono pode entrar com o usuário ou com o
              e-mail.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-store-plan">Plano</Label>
              <Select onValueChange={setPlan} value={plan}>
                <SelectTrigger className="w-full" id="new-store-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-store-due">Primeiro vencimento</Label>
              <Input disabled={plan === 'Cortesia'} id="new-store-due" name="dueDate" type="date" />
            </div>
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
              {saving ? 'Criando…' : 'Criar loja e convidar o dono'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
