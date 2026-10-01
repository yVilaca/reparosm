'use client';

import { useMemo, useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Part, Shop } from '@/lib/types';

const categoryIcons: Record<string, string> = {
  Capinhas: '▣',
  Carregadores: '⌁',
  Acessórios: '◇',
};

export default function PublicStoreRoute({
  items,
  shop,
  error,
}: {
  items: Part[];
  shop: Shop;
  error?: string;
}) {
  const { notify } = useFeedback();
  const [category, setCategory] = useState('Todos');
  const categories = useMemo(
    () => [
      'Todos',
      ...Array.from(new Set(items.map((part) => part.category))).filter((value): value is string =>
        Boolean(value),
      ),
    ],
    [items],
  );
  const visible = category === 'Todos' ? items : items.filter((part) => part.category === category);
  const ask = (part: Part) => {
    if (!hasValidWhatsapp(shop.phone))
      return notify('A assistência ainda não cadastrou o WhatsApp.', 'error');
    window.open(
      whatsappUrl(
        shop.phone,
        `Olá! Vi ${part.name} na vitrine da ${shop.name || 'ReparoSM'} e tenho interesse. Valor anunciado: ${formatMoney(part.price)}.`,
      ),
      '_blank',
      'noopener,noreferrer',
    );
  };
  if (error)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="grid gap-2 text-center">
            <h1 className="text-lg font-semibold">Vitrine indisponível</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong className="text-lg">{shop.name || 'ReparoSM'}</strong>
          <p className="text-sm text-muted-foreground">Vitrine online</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {shop.phone || 'Produtos e acessórios para celular'}
        </p>
      </header>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Catálogo online
            </p>
            <h1 className="text-xl font-semibold">Produtos disponíveis</h1>
            <p className="text-sm text-muted-foreground">
              {shop.description ||
                'Escolha um produto e fale diretamente com a assistência pelo WhatsApp.'}
            </p>
          </div>
          <div className="text-right">
            <strong className="text-2xl">{items.length}</strong>
            <p className="text-sm text-muted-foreground">itens disponíveis</p>
          </div>
        </CardContent>
      </Card>
      {categories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <Button
              key={item}
              onClick={() => setCategory(item)}
              size="sm"
              type="button"
              variant={category === item ? 'default' : 'outline'}
            >
              {item}
            </Button>
          ))}
        </div>
      )}
      {visible.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((part, index) => (
            <Card key={`${part.name}-${index}`}>
              <CardContent className="grid gap-2">
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted text-3xl">
                  {part.image ? (
                    // Arbitrary shop images are stored as data or user-provided URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      src={part.image}
                    />
                  ) : (
                    <span aria-hidden="true">{categoryIcons[part.category || ''] || '⚙'}</span>
                  )}
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {part.category || 'Produto'}
                </span>
                <h2 className="font-semibold">{part.name}</h2>
                <p className="text-sm text-muted-foreground">{part.stock} unidades disponíveis</p>
                <strong className="text-lg">{formatMoney(part.price)}</strong>
                <Button onClick={() => ask(part)} size="sm" type="button">
                  Pedir pelo WhatsApp
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          description='Os produtos marcados como "Publicar na vitrine" aparecerão aqui.'
          title="Nenhum produto publicado"
        />
      )}
      <footer className="mt-8 flex flex-col items-center gap-1 border-t pt-6 text-center text-sm text-muted-foreground">
        <strong className="text-foreground">{shop.name || 'ReparoSM'}</strong>
        <span>{shop.address || 'Atendimento pelo WhatsApp'}</span>
      </footer>
    </main>
  );
}
