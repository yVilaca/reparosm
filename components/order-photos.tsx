'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';

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
    <section
      aria-labelledby="order-photos-title"
      className="my-4 rounded-xl border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="mb-1 text-sm font-semibold" id="order-photos-title">
            Fotos de prova
          </h3>
          <p className="text-xs text-muted-foreground">
            JPG, PNG ou WebP · até 8 MB por foto · máximo de 5 fotos
          </p>
        </div>
        <label
          aria-disabled={uploading}
          className={`inline-flex h-8 cursor-pointer items-center rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${uploading ? 'pointer-events-none cursor-wait opacity-60' : ''}`}
        >
          {uploading ? 'Enviando...' : '+ Adicionar foto'}
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void upload(event)}
            multiple
            type="file"
          />
        </label>
      </div>
      {loading ? (
        <small>Carregando fotos...</small>
      ) : photos.length ? (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {photos.map((photo) => (
            <article className="overflow-hidden rounded-lg border bg-card" key={photo.id}>
              <Image
                alt="Foto de prova da ordem de serviço"
                className="block h-24 w-full bg-muted object-cover"
                loading="lazy"
                src={`/api/order-photos/${encodeURIComponent(photo.id)}`}
                height={180}
                unoptimized
                width={240}
              />
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                    new Date(photo.createdAt),
                  )}{' '}
                  · {Math.max(1, Math.round(photo.sizeBytes / 1024))} KB
                </span>
                <Button
                  className="h-auto px-2 py-1 text-destructive"
                  onClick={() => void remove(photo)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Excluir
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Ainda não há fotos anexadas a esta OS.</p>
      )}
    </section>
  );
}
