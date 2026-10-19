import { clientIp, currentAccount, sameOrigin } from '@/lib/auth';
import { isSignatureRole, SIGNER_NAME_LIMIT } from '@/lib/order-signatures';
import * as signatures from '@/lib/repos/order-signatures';
import * as shops from '@/lib/repos/shops';

type Context = { params: Promise<{ orderId: string }> };
const noStore = { 'Cache-Control': 'no-store' };

async function guard(request: Request, write: boolean) {
  if (write && !sameOrigin(request))
    return { error: Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }) };
  const account = await currentAccount(request);
  if (!account) return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  return { account };
}

/** Assinaturas da OS (imagem e o que mudou depois de assinar) e os termos da loja. */
export async function GET(request: Request, { params }: Context) {
  const { account, error } = await guard(request, false);
  if (error) return error;
  const { orderId } = await params;
  const [list, shop] = await Promise.all([
    signatures.list(account.id, orderId),
    shops.get(account.id, 'shop-main'),
  ]);
  // Os termos aparecem na janela de assinar: é com eles que o cliente concorda.
  return Response.json({ signatures: list, terms: shop?.data.terms || '' }, { headers: noStore });
}

/** Grava a assinatura feita na tela (substitui a anterior do mesmo papel). */
export async function POST(request: Request, { params }: Context) {
  const { account, error } = await guard(request, true);
  if (error) return error;
  const { orderId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { role, signerName, image } = (body ?? {}) as Record<string, unknown>;
  if (!isSignatureRole(role))
    return Response.json({ error: 'Assinatura inválida.' }, { status: 400 });
  const name = typeof signerName === 'string' ? signerName.trim() : '';
  if (!name || name.length > SIGNER_NAME_LIMIT)
    return Response.json({ error: 'Informe o nome de quem assina.' }, { status: 400 });
  const png = signatures.pngFromDataUrl(image);
  if (!png)
    return Response.json(
      { error: 'A imagem da assinatura não foi aceita. Assine de novo.' },
      { status: 400 },
    );
  const saved = await signatures.save(
    account.id,
    orderId,
    role,
    { image: png, signerName: name },
    {
      userId: account.user.id,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    },
  );
  if (!saved) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json({ signatures: saved }, { status: 201, headers: noStore });
}

/** Remove a assinatura de um papel (`?papel=customer|shop`). */
export async function DELETE(request: Request, { params }: Context) {
  const { account, error } = await guard(request, true);
  if (error) return error;
  const { orderId } = await params;
  const role = new URL(request.url).searchParams.get('papel');
  if (!isSignatureRole(role))
    return Response.json({ error: 'Assinatura inválida.' }, { status: 400 });
  const left = await signatures.remove(account.id, orderId, role);
  if (!left) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  return Response.json({ signatures: left }, { headers: noStore });
}
