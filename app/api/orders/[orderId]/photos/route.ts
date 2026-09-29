import { currentAccount, sameOrigin } from '@/lib/auth';
import { detectOrderPhotoType, MAX_ORDER_PHOTO_BYTES } from '@/lib/order-photo-storage';
import * as orderPhotos from '@/lib/repos/order-photos';
import { orders } from '@/lib/repos';

type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, { params }: Context) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { orderId } = await params;
  if (!(await orders.get(account.id, orderId)))
    return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  const photos = await orderPhotos.list(account.id, orderId);
  return Response.json({ photos: photos.map(orderPhotos.toPublic) });
}

export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const { orderId } = await params;

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_ORDER_PHOTO_BYTES + 64 * 1024)
    return Response.json({ error: 'A foto deve ter no máximo 8 MB.' }, { status: 413 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('photo');
  } catch {
    return Response.json({ error: 'Envie uma foto válida.' }, { status: 400 });
  }
  if (!(file instanceof File))
    return Response.json({ error: 'Selecione uma foto.' }, { status: 400 });
  if (!file.size || file.size > MAX_ORDER_PHOTO_BYTES)
    return Response.json({ error: 'A foto deve ter no máximo 8 MB.' }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectOrderPhotoType(bytes);
  if (!detected || file.type !== detected.contentType)
    return Response.json({ error: 'Use uma imagem JPG, PNG ou WebP válida.' }, { status: 400 });

  const created = await orderPhotos.create(account.id, {
    id: `photo-${crypto.randomUUID()}`,
    orderId,
    contentType: detected.contentType,
    sizeBytes: bytes.byteLength,
    bytes,
  });
  if (!created) return Response.json({ error: 'Ordem não encontrada.' }, { status: 404 });
  if (created === 'limit')
    return Response.json({ error: 'Cada OS pode ter até 5 fotos.' }, { status: 409 });
  return Response.json({ photo: orderPhotos.toPublic(created) }, { status: 201 });
}
