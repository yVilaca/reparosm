import { currentAccount, sameOrigin } from '@/lib/auth';
import * as checklists from '@/lib/repos/order-checklist';

type Context = { params: Promise<{ orderId: string }> };

async function guard(request: Request) {
  if (!sameOrigin(request))
    return { error: Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }) };
  const account = await currentAccount(request);
  if (!account) return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  return { account };
}

/** Gera o link (e o QR code) do teste pelo próprio aparelho. */
export async function POST(request: Request, { params }: Context) {
  const { account, error } = await guard(request);
  if (error) return error;
  const { orderId } = await params;
  const started = await checklists.startDeviceTest(account.id, orderId, account.user.id);
  if (!started) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json(started, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

/** Encerra o teste pelo aparelho: o link deixa de valer. */
export async function DELETE(request: Request, { params }: Context) {
  const { account, error } = await guard(request);
  if (error) return error;
  const { orderId } = await params;
  return Response.json({ session: await checklists.endDeviceTest(account.id, orderId) });
}
