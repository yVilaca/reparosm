'use client';

import { useMemo, useState } from 'react';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Part, Shop } from '@/lib/types';

export default function PublicStoreRoute({
  items,
  shop,
  error,
}: {
  items: Part[];
  shop: Shop;
  error?: string;
}) {
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
      return alert('A assistência ainda não cadastrou o WhatsApp.');
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
      <main className="public-page">
        <article className="public-card">
          <h1>Vitrine indisponível</h1>
          <p>{error}</p>
        </article>
      </main>
    );
  return (
    <main className="store-page">
      <header>
        <div>
          <b>{shop.name || 'ReparoSM'}</b>
          <span>Vitrine online</span>
        </div>
        <span>{shop.phone || 'Produtos e acessórios para celular'}</span>
      </header>
      <section>
        <div className="store-heading">
          <div>
            <span>CATÁLOGO ONLINE</span>
            <h1>Produtos disponíveis</h1>
            <p>Escolha um produto e fale diretamente com a assistência pelo WhatsApp.</p>
          </div>
          <div>
            <b>{items.length}</b>
            <small>itens disponíveis</small>
          </div>
        </div>
        {categories.length > 1 && (
          <nav className="store-categories">
            {categories.map((item) => (
              <button
                type="button"
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </nav>
        )}
        {visible.length ? (
          <div className="store-grid">
            {visible.map((part, index) => (
              <article key={`${part.name}-${index}`}>
                <div>
                  {part.category === 'Capinhas'
                    ? '▣'
                    : part.category === 'Carregadores'
                      ? '⌁'
                      : part.category === 'Acessórios'
                        ? '◇'
                        : '⚙'}
                </div>
                <small>{part.category || 'Produto'}</small>
                <h2>{part.name}</h2>
                <p>{part.stock} unidades disponíveis</p>
                <strong>{formatMoney(part.price)}</strong>
                <button type="button" onClick={() => ask(part)}>
                  Pedir pelo WhatsApp
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="store-empty">
            <b>Nenhum produto publicado</b>
            <span>Os produtos marcados como “Publicar na vitrine” aparecerão aqui.</span>
          </div>
        )}
        <footer className="store-footer">
          <b>{shop.name || 'ReparoSM'}</b>
          <span>{shop.address || 'Atendimento pelo WhatsApp'}</span>
        </footer>
      </section>
    </main>
  );
}
