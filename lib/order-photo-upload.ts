export async function uploadOrderPhotos(
  orderId: string,
  files: File[],
  send: typeof fetch = fetch,
) {
  let uploaded = 0;
  for (const file of files) {
    const body = new FormData();
    body.set('photo', file);
    try {
      const response = await send(`/api/orders/${encodeURIComponent(orderId)}/photos`, {
        method: 'POST',
        body,
      });
      if (response.ok) uploaded++;
    } catch {
      // Continue so one failed image does not block the remaining evidence photos.
    }
  }
  return uploaded;
}
