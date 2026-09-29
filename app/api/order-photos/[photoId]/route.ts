import { currentAccount, sameOrigin } from '@/lib/auth';
import * as orderPhotos from '@/lib/repos/order-photos';

type Context = { params: Promise<{ photoId: string }> };

export async function GET(request: Request, { params }: Context) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { photoId } = await params;
  const found = await orderPhotos.getBytes(account.id, photoId);
  if (!found) return Response.json({ error: 'Foto não encontrada.' }, { status: 404 });

  return new Response(new Uint8Array(found.bytes), {
    headers: {
      'Content-Type': found.photo.contentType,
      'Content-Length': String(found.bytes.byteLength),
      'Content-Disposition': `inline; filename="${found.photo.id}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(request: Request, { params }: Context) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { photoId } = await params;
  const photo = await orderPhotos.remove(account.id, photoId);
  if (!photo) return Response.json({ error: 'Foto não encontrada.' }, { status: 404 });
  return Response.json({ ok: true });
}
