'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import TeamList, { type TeamApi } from '@/components/team-list';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import SoftBanner from '@/components/ui/soft-banner';
import { Avatar, CopyLinkDialog, postJson } from '@/components/user-access';
import { whenLabel } from '@/lib/user-labels';
import type { LinkDelivery, PasswordRequest, StoreUser, TeamMember } from '@/lib/types';

const team = <T,>(body: object) => postJson<T>('/api/team', body);
const api: TeamApi = {
  create: async (person) =>
    (await team<{ invite: LinkDelivery | null }>({ action: 'create', ...person })).invite,
  update: async (id, changes) => void (await team({ action: 'update', id, ...changes })),
  setEmail: async (id, email) =>
    void (await team<{ user: StoreUser }>({ action: 'set-email', id, email })),
  sendLink: async (id) =>
    (await team<{ invite: LinkDelivery }>({ action: 'send-link', id })).invite,
  copyLink: async (id) =>
    (await team<{ invite: LinkDelivery }>({ action: 'copy-link', id })).invite,
  disconnect: async (id) => void (await team({ action: 'disconnect', id })),
};

/** Equipe: o Dono decide quem usa o sistema na loja e cuida do acesso de cada um. */
export default function TeamRoute({
  storeName,
  selfId,
  emailEnabled,
  initialUsers,
  initialRequests,
}: {
  storeName: string;
  selfId: string;
  emailEnabled: boolean;
  initialUsers: TeamMember[];
  initialRequests: PasswordRequest[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [linking, setLinking] = useState<PasswordRequest | null>(null);

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
      {!emailEnabled && (
        <SoftBanner
          className="mb-6"
          description="Por enquanto, os convites e links de nova senha aparecem para você copiar e mandar pelo WhatsApp."
          icon={KeyRound}
          title="O envio de e-mail ainda não está ligado"
        />
      )}
      {requests.length > 0 && (
        <div className="mb-6">
          <ListGroup count={requests.length} title="Pediram senha nova" tone="warning">
            {requests.map((request) => (
              <ListRow
                actions={
                  <Button onClick={() => setLinking(request)} size="sm">
                    <KeyRound aria-hidden="true" />
                    Gerar link de nova senha
                  </Button>
                }
                details={`${request.username} · sem e-mail cadastrado · pediu ${whenLabel(request.createdAt)}`}
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
      {linking && (
        <CopyLinkDialog
          close={() => {
            setLinking(null);
            void reload();
          }}
          generate={() => api.copyLink(linking.userId, false)}
          person={{ ...linking, storeName }}
        />
      )}
    </>
  );
}
