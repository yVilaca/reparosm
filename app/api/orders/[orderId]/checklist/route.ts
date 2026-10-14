import { currentAccount, sameOrigin } from '@/lib/auth';
import { parsePatch } from '@/lib/order-checklist';
import * as checklists from '@/lib/repos/order-checklist';

type Context = { params: Promise<{ orderId: string }> };

const headers = { 'Cache-Control': 'no-store' };

async function guard(request: Request, write: boolean) {
  if (write && !sameOrigin(request))
    return { error: Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }) };
  const account = await currentAccount(request);
  if (!account) return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  return { account };
}

const notFound = () => Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });

/** Checklist da OS e situação do teste pelo aparelho (a bancada consulta enquanto ele roda). */
export async function GET(request: Request, { params }: Context) {
  const { account, error } = await guard(request, false);
  if (error) return error;
  const { orderId } = await params;
  const result = await checklists.get(account.id, orderId);
  return result ? Response.json(result, { headers }) : notFound();
}

/** Grava só o que a loja mudou: um teste, a resposta de "liga?", as avarias ou as observações. */
export async function PATCH(request: Request, { params }: Context) {
  const { account, error } = await guard(request, true);
  if (error) return error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const patch = parsePatch(body);
  if (!patch) return Response.json({ error: 'Checklist inválido.' }, { status: 400 });
  const { orderId } = await params;
  const result = await checklists.update(account.id, orderId, patch, account.user.id);
  return result ? Response.json(result, { headers }) : notFound();
}
