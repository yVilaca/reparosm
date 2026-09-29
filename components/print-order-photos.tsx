export type PrintPhoto = { id: string; contentType: string };

export default function PrintOrderPhotos({ photos }: { photos: PrintPhoto[] }) {
  if (!photos.length) return null;
  return (
    <section className="print-order-section print-order-photos">
      <h2>Fotos de prova</h2>
      <div className="print-order-photos-grid">
        {photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element -- printed page, not the app shell
          <img key={photo.id} src={`/api/order-photos/${photo.id}`} alt="Foto de prova da ordem" />
        ))}
      </div>
    </section>
  );
}
