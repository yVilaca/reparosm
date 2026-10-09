'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import RowMenu from '@/components/ui/row-menu';
import { Avatar, PasswordDialog, PersonDialog } from '@/components/user-access';
import { lastAccessLabel, roleLabel } from '@/lib/user-labels';
import type { TeamMember, UserRole, UserStatus } from '@/lib/types';

/** O que a lista faz com cada pessoa; Equipe e Lojas falam com rotas diferentes. */
export type TeamApi = {
  create: (person: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  update: (id: string, changes: { role?: UserRole; status?: UserStatus }) => Promise<void>;
  resetPassword: (id: string, password: string, identityConfirmed: boolean) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
};

const devices = (count: number) =>
  count === 1 ? 'Conectado em 1 aparelho' : `Conectado em ${count} aparelhos`;

/**
 * Pessoas de uma loja, com acesso e sem acesso. Cada linha mostra papel, se
 * está conectada e quando entrou; as ações ficam no menu "…".
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
  /** Administrador confirma a identidade antes de definir senha. */
  confirmIdentity?: boolean;
  addLabel?: string;
  storeName: string;
  onChanged: () => Promise<void> | void;
}) {
  const { notify, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
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
                  <DropdownMenuItem onSelect={() => setResetting(member)}>
                    Definir senha provisória
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
        details={`${member.username} · ${roleLabel(member.role)}`}
        key={member.id}
        leading={<Avatar muted={off} name={member.name} />}
        note={
          member.passwordRequested
            ? 'Pediu senha nova'
            : member.mustChangePassword && !off
              ? 'Senha provisória'
              : undefined
        }
        noteTone={member.passwordRequested || member.mustChangePassword ? 'warning' : undefined}
        title={member.name}
        value={
          off ? (
            <span className="font-normal text-muted-foreground">Sem acesso</span>
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
          description={`Cria um acesso para ${storeName}. Passe o usuário e a senha provisória para a pessoa.`}
          submit={async (person) => {
            await api.create(person);
            setAdding(false);
            notify(`${person.name} foi cadastrado.`, 'success');
            await onChanged();
          }}
          title="Adicionar pessoa"
        />
      )}
      {resetting && (
        <PasswordDialog
          close={() => setResetting(null)}
          confirmIdentity={confirmIdentity}
          submit={async (password, identityConfirmed) => {
            await api.resetPassword(resetting.id, password, identityConfirmed);
            setResetting(null);
            notify(`Senha provisória definida. Passe para ${resetting.name}.`, 'success');
            await onChanged();
          }}
          user={resetting}
        />
      )}
    </div>
  );
}
