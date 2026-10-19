'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import TeamList, { type TeamApi } from '@/components/team-list';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import SoftBanner from '@/components/ui/soft-banner';
import { Avatar, CopyLinkDialog, postJson } from '@/components/user-access';
import { whenLabel } from '@/lib/user-labels';
import type {
  LinkDelivery,
  MfaResetRequest,
  PasswordRequest,
  StoreUser,
  TeamMember,
} from '@/lib/types';

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
  maxActiveUsers,
  selfId,
  emailEnabled,
  initialUsers,
  initialRequests,
  initialMfaRequests,
}: {
  storeName: string;
  maxActiveUsers?: number;
  selfId: string;
  emailEnabled: boolean;
  initialUsers: TeamMember[];
  initialRequests: PasswordRequest[];
  initialMfaRequests: MfaResetRequest[];
}) {
  const { confirm, notify } = useFeedback();
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [mfaRequests, setMfaRequests] = useState(initialMfaRequests);
  const [linking, setLinking] = useState<PasswordRequest | null>(null);

  const reload = async () => {
    const response = await fetch('/api/team', { cache: 'no-store' });
    if (!response.ok) return;
    const result = (await response.json()) as {
      users: TeamMember[];
      requests: PasswordRequest[];
      mfaRequests: MfaResetRequest[];
    };
    setUsers(result.users);
    setRequests(result.requests);
    setMfaRequests(result.mfaRequests);
  };

  const resolveMfa = async (request: MfaResetRequest, approve: boolean) => {
    if (
      approve &&
      !(await confirm(
        `Remover o autenticador de ${request.name}? Todos os aparelhos conectados sairão.`,
      ))
    )
      return;
    try {
      await team({
        action: approve ? 'approve-mfa-reset' : 'dismiss-mfa-reset',
        id: request.userId,
      });
      notify(
        approve ? 'Autenticador removido e sessões encerradas.' : 'Pedido ignorado.',
        'success',
      );
      await reload();
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : 'Não foi possível resolver o pedido.',
        'error',
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem usa o ReparoSM na loja. Cada pessoa entra com o próprio usuário; cada aparelho conectado ocupa uma vaga do plano."
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
      {mfaRequests.length > 0 && (
        <div className="mb-6">
          <ListGroup
            count={mfaRequests.length}
            title="Equipe sem acesso ao autenticador"
            tone="warning"
          >
            {mfaRequests.map((request) => (
              <ListRow
                actions={
                  <>
                    <Button onClick={() => void resolveMfa(request, true)} size="sm">
                      Aprovar reset do autenticador
                    </Button>
                    <Button
                      onClick={() => void resolveMfa(request, false)}
                      size="sm"
                      variant="outline"
                    >
                      Ignorar
                    </Button>
                  </>
                }
                details={`${request.username} · pediu ${whenLabel(request.requestedAt)}`}
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
        maxActiveUsers={maxActiveUsers}
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
