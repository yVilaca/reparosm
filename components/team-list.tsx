'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import RowMenu from '@/components/ui/row-menu';
import {
  Avatar,
  CopyLinkDialog,
  DeliveryDialog,
  EmailDialog,
  PersonDialog,
  type NewPerson,
} from '@/components/user-access';
import { lastAccessLabel, roleLabel } from '@/lib/user-labels';
import type { LinkDelivery, TeamMember, UserRole, UserStatus } from '@/lib/types';

/** O que a lista faz com cada pessoa; Equipe e Lojas falam com rotas diferentes. */
export type TeamApi = {
  create: (person: NewPerson) => Promise<LinkDelivery | null>;
  update: (id: string, changes: { role?: UserRole; status?: UserStatus }) => Promise<void>;
  setEmail: (id: string, email: string) => Promise<void>;
  /** Manda o link (convite ou nova senha) para o e-mail cadastrado. */
  sendLink: (id: string) => Promise<LinkDelivery>;
  /** Gera um link para copiar; o administrador confirma a identidade antes. */
  copyLink: (id: string, identityConfirmed: boolean) => Promise<LinkDelivery>;
  disconnect: (id: string) => Promise<void>;
};

const devices = (count: number) =>
  count === 1 ? 'Conectado em 1 aparelho' : `Conectado em ${count} aparelhos`;

/** O aviso da linha: o que falta para a pessoa entrar, ou que pediu senha nova. */
function noteOf(member: TeamMember): { note?: string; warn?: boolean } {
  if (member.status !== 'active') return {};
  if (member.passwordRequested) return { note: 'Pediu senha nova', warn: true };
  if (member.mustChangePassword) return { note: 'Senha provisória', warn: true };
  return {};
}

/**
 * Pessoas de uma loja, com acesso e sem acesso. Cada linha mostra papel, e-mail,
 * se está conectada e quando entrou; as ações ficam no menu "…".
 */
export default function TeamList({
  members,
  selfId,
  api,
  confirmIdentity = false,
  addLabel = 'Adicionar pessoa',
  storeName,
  onChanged,
}: {
  members: TeamMember[];
  /** Quem está usando: não se desativa nem se rebaixa por aqui. */
  selfId?: string;
  api: TeamApi;
  /** Administrador confirma a identidade antes de gerar link para copiar. */
  confirmIdentity?: boolean;
  addLabel?: string;
  storeName: string;
  onChanged: () => Promise<void> | void;
}) {
  const { notify, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState<TeamMember | null>(null);
  const [emailing, setEmailing] = useState<TeamMember | null>(null);
  const [delivered, setDelivered] = useState<{ delivery: LinkDelivery; name: string } | null>(null);
  const active = members.filter((member) => member.status === 'active');
  const disabled = members.filter((member) => member.status !== 'active');

  const run = async (action: () => Promise<void>, done: string) => {
    try {
      await action();
      notify(done, 'success');
      await onChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível salvar.', 'error');
    }
  };

  const sendLink = async (member: TeamMember) => {
    try {
      const delivery = await api.sendLink(member.id);
      setDelivered({ delivery, name: member.name });
      await onChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível enviar.', 'error');
    }
  };

  const setStatus = async (member: TeamMember, status: UserStatus) => {
    if (
      status === 'disabled' &&
      !(await confirm(`Tirar o acesso de ${member.name}? A pessoa sai dos aparelhos na hora.`))
    )
      return;
    await run(
      () => api.update(member.id, { status }),
      status === 'disabled'
        ? `${member.name} não tem mais acesso.`
        : `${member.name} voltou a ter acesso.`,
    );
  };

  const setRole = async (member: TeamMember, role: UserRole) => {
    if (!(await confirm(`${member.name} passa a ser ${roleLabel(role)}?`))) return;
    await run(() => api.update(member.id, { role }), `${member.name} agora é ${roleLabel(role)}.`);
  };

  const row = (member: TeamMember) => {
    const self = member.id === selfId;
    const off = member.status !== 'active';
    const ready = member.access === 'ready';
    const { note, warn } = noteOf(member);
    return (
      <ListRow
        actions={
          self ? (
            <Badge variant="secondary">Você</Badge>
          ) : (
            <RowMenu label={member.name}>
              {off ? (
                <DropdownMenuItem onSelect={() => void setStatus(member, 'active')}>
                  Reativar acesso
                </DropdownMenuItem>
              ) : (
                <>
                  {member.email && (
                    <DropdownMenuItem onSelect={() => void sendLink(member)}>
                      {ready ? 'Enviar link de nova senha' : 'Reenviar convite'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setCopying(member)}>
                    {ready ? 'Copiar link de nova senha' : 'Copiar link do convite'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEmailing(member)}>
                    {member.email ? 'Alterar e-mail' : 'Cadastrar e-mail'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void setRole(member, member.role === 'owner' ? 'staff' : 'owner')
                    }
                  >
                    {member.role === 'owner' ? 'Tornar Funcionário' : 'Tornar Dono'}
                  </DropdownMenuItem>
                  {member.sessions > 0 && (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(
                          () => api.disconnect(member.id),
                          `${member.name} saiu dos aparelhos.`,
                        )
                      }
                    >
                      Desconectar dos aparelhos
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void setStatus(member, 'disabled')}
                    variant="destructive"
                  >
                    Tirar acesso
                  </DropdownMenuItem>
                </>
              )}
            </RowMenu>
          )
        }
        details={[member.email || member.username, roleLabel(member.role)].join(' · ')}
        key={member.id}
        leading={<Avatar muted={off || !ready} name={member.name} />}
        note={note}
        noteTone={warn ? 'warning' : undefined}
        title={member.name}
        value={
          off ? (
            <span className="font-normal text-muted-foreground">Sem acesso</span>
          ) : member.access === 'invited' ? (
            <span className="font-normal text-muted-foreground">Convite pendente</span>
          ) : member.access === 'invite-expired' ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">Convite vencido</span>
          ) : member.sessions > 0 ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              {devices(member.sessions)}
            </span>
          ) : (
            <span className="font-normal text-muted-foreground">
              {lastAccessLabel(member.lastLoginAt)}
            </span>
          )
        }
      />
    );
  };

  return (
    <div className="grid gap-6">
      <ListGroup
        aside={
          <Button onClick={() => setAdding(true)} size="sm" variant="outline">
            <UserPlus aria-hidden="true" />
            {addLabel}
          </Button>
        }
        count={active.length}
        title="Com acesso"
      >
        {active.map(row)}
      </ListGroup>
      {disabled.length > 0 && (
        <ListGroup count={disabled.length} title="Sem acesso">
          {disabled.map(row)}
        </ListGroup>
      )}
      {adding && (
        <PersonDialog
          close={() => setAdding(false)}
          description={`Cria um acesso para ${storeName}. A pessoa recebe um link para criar a própria senha.`}
          submit={async (person) => {
            const delivery = await api.create(person);
            setAdding(false);
            notify(`${person.name} foi cadastrado.`, 'success');
            if (delivery) setDelivered({ delivery, name: person.name });
            await onChanged();
          }}
          title="Adicionar pessoa"
        />
      )}
      {copying && (
        <CopyLinkDialog
          close={() => {
            setCopying(null);
            void onChanged();
          }}
          confirmIdentity={confirmIdentity}
          generate={(identityConfirmed) => api.copyLink(copying.id, identityConfirmed)}
          person={{ ...copying, storeName }}
        />
      )}
      {emailing && (
        <EmailDialog
          close={() => setEmailing(null)}
          person={emailing}
          submit={async (email) => {
            await api.setEmail(emailing.id, email);
            setEmailing(null);
            notify(email ? 'E-mail salvo.' : 'E-mail removido.', 'success');
            await onChanged();
          }}
        />
      )}
      {delivered && (
        <DeliveryDialog
          close={() => setDelivered(null)}
          delivery={delivered.delivery}
          person={{ name: delivered.name, storeName }}
        />
      )}
    </div>
  );
}
