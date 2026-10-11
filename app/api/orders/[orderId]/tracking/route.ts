import { currentAccount, sameOrigin } from '@/lib/auth';
import * as tracking from '@/lib/repos/order-tracking';

type Context = { params: Promise<{ orderId: string }> };

async function guard(request: Request, write: boolean) {
  if (write && !sameOrigin(request))
    return { error: Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }) };
  const account = await currentAccount(request);
  if (!account) return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  return { account };
}

/** Situação dos links da OS: quantos valem e se o cliente abriu. */
export async function GET(request: Request, { params }: Context) {
  const { account, error } = await guard(request, false);
  if (error) return error;
  const { orderId } = await params;
  return Response.json({ summary: await tracking.summary(account.id, orderId) });
}

/** Gera um link novo para mandar ao cliente. */
export async function POST(request: Request, { params }: Context) {
  const { account, error } = await guard(request, true);
  if (error) return error;
  const { orderId } = await params;
  const link = await tracking.issue(account.id, orderId, account.user.id);
  if (!link) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json(
    { url: link.url, summary: await tracking.summary(account.id, orderId) },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Desativa todos os links da OS. */
export async function DELETE(request: Request, { params }: Context) {
  const { account, error } = await guard(request, true);
  if (error) return error;
  const { orderId } = await params;
  const revoked = await tracking.revokeAll(account.id, orderId);
  return Response.json({ revoked, summary: await tracking.summary(account.id, orderId) });
}
