'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import TeamList, { type TeamApi } from '@/components/team-list';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import { Avatar, PasswordDialog, postJson } from '@/components/user-access';
import { whenLabel } from '@/lib/user-labels';
import type { PasswordRequest, TeamMember } from '@/lib/types';

const api: TeamApi = {
  create: async (person) => void (await postJson('/api/team', { action: 'create', ...person })),
  update: async (id, changes) =>
    void (await postJson('/api/team', { action: 'update', id, ...changes })),
  resetPassword: async (id, password) =>
    void (await postJson('/api/team', { action: 'reset-password', id, password })),
  disconnect: async (id) => void (await postJson('/api/team', { action: 'disconnect', id })),
};

/** Equipe: o Dono decide quem usa o sistema na loja e cuida do acesso de cada um. */
export default function TeamRoute({
  storeName,
  selfId,
  initialUsers,
  initialRequests,
}: {
  storeName: string;
  selfId: string;
  initialUsers: TeamMember[];
  initialRequests: PasswordRequest[];
}) {
  const { notify } = useFeedback();
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [resetting, setResetting] = useState<PasswordRequest | null>(null);

  const reload = async () => {
    const response = await fetch('/api/team', { cache: 'no-store' });
    if (!response.ok) return;
    const result = (await response.json()) as { users: TeamMember[]; requests: PasswordRequest[] };
    setUsers(result.users);
    setRequests(result.requests);
  };

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem usa o ReparoSM na loja. Cada pessoa entra com o próprio usuário, ao mesmo tempo e em quantos aparelhos precisar."
      />
      {requests.length > 0 && (
        <div className="mb-6">
          <ListGroup count={requests.length} title="Pediram senha nova" tone="warning">
            {requests.map((request) => (
              <ListRow
                actions={
                  <Button onClick={() => setResetting(request)} size="sm">
                    <KeyRound aria-hidden="true" />
                    Definir senha provisória
                  </Button>
                }
                details={`${request.username} · pediu ${whenLabel(request.createdAt)}`}
                key={request.id}
                leading={<Avatar name={request.name} />}
                title={request.name}
              />
            ))}
          </ListGroup>
        </div>
      )}
      <TeamList
        api={api}
        members={users}
        onChanged={reload}
        selfId={selfId}
        storeName={storeName}
      />
      {resetting && (
        <PasswordDialog
          close={() => setResetting(null)}
          submit={async (password) => {
            await api.resetPassword(resetting.userId, password, false);
            setResetting(null);
            notify(`Senha provisória definida. Passe para ${resetting.name}.`, 'success');
            await reload();
          }}
          user={resetting}
        />
      )}
    </>
  );
}
