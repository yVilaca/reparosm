'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useFeedback } from '@/components/feedback';

type Photo = {
  id: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export default function OrderPhotos({ orderId }: { orderId: string }) {
  const { notify, confirm } = useFeedback();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const url = `/api/orders/${encodeURIComponent(orderId)}/photos`;

  const refresh = async () => {
    const response = await fetch(url, { cache: 'no-store' });
    const result = (await response.json()) as { photos?: Photo[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as fotos.');
    setPhotos(result.photos || []);
  };

  useEffect(() => {
    let active = true;
    fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as { photos?: Photo[]; error?: string };
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as fotos.');
        if (active) setPhotos(result.photos || []);
      })
      .catch((error: unknown) => {
        if (active)
          notify(
            error instanceof Error ? error.message : 'Não foi possível carregar as fotos.',
            'error',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [notify, url]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const body = new FormData();
        body.set('photo', file);
        const response = await fetch(url, { method: 'POST', body });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a foto.');
      }
      await refresh();
      notify('Foto(s) adicionada(s) à ordem.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar as fotos.', 'error');
      await refresh().catch(() => {});
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo: Photo) => {
    if (!(await confirm('Excluir esta foto da ordem?'))) return;
    try {
      const response = await fetch(`/api/order-photos/${encodeURIComponent(photo.id)}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir a foto.');
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir a foto.', 'error');
    }
  };

  return (
    <section className="order-photos" aria-labelledby="order-photos-title">
      <div className="order-photos-heading">
        <div>
          <h3 id="order-photos-title">Fotos de prova</h3>
          <small>JPG, PNG ou WebP · até 8 MB por foto · máximo de 5 fotos</small>
        </div>
        <label className={`order-photos-add${uploading ? ' disabled' : ''}`}>
          {uploading ? 'Enviando...' : '+ Adicionar foto'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            onChange={(event) => void upload(event)}
          />
        </label>
      </div>
      {loading ? (
        <small>Carregando fotos...</small>
      ) : photos.length ? (
        <div className="order-photos-grid">
          {photos.map((photo) => (
            <article key={photo.id}>
              <Image
                src={`/api/order-photos/${encodeURIComponent(photo.id)}`}
                alt="Foto de prova da ordem de serviço"
                loading="lazy"
                width={240}
                height={180}
                unoptimized
              />
              <div>
                <small>
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                    new Date(photo.createdAt),
                  )}{' '}
                  · {Math.max(1, Math.round(photo.sizeBytes / 1024))} KB
                </small>
                <button type="button" onClick={() => void remove(photo)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="order-photos-empty">Ainda não há fotos anexadas a esta OS.</p>
      )}
    </section>
  );
}
