export type PrintPhoto = { id: string; contentType: string };

export default function PrintOrderPhotos({ photos }: { photos: PrintPhoto[] }) {
  if (!photos.length) return null;
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 font-semibold">Fotos de prova</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element -- printed page, not the app shell
          <img
            alt="Foto de prova da ordem"
            className="aspect-square w-full rounded-lg border object-cover"
            key={photo.id}
            src={`/api/order-photos/${photo.id}`}
          />
        ))}
      </div>
    </section>
  );
}
