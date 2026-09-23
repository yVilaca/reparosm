'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type { Part, Shop } from '@/lib/types';

type PublicRecord<T> = { id: string; data: T };
type PublicResponse<T> = { records?: PublicRecord<T>[]; error?: string };

export default function Vitrine() {
  const [items, setItems] = useState<Part[]>([]),
    [shop, setShop] = useState<Shop>({ name: 'ReparoSM', phone: '' }),
    [category, setCategory] = useState('Todos'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const account = new URLSearchParams(window.location.search).get('loja');
    if (!account) {
      setError('Link incompleto. Peça à assistência o link exclusivo da vitrine.');
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`/api/state?public=1&type=part&account=${encodeURIComponent(account)}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/state?public=1&type=shop&account=${encodeURIComponent(account)}`).then((r) =>
        r.json(),
      ),
    ])
      .then(async ([partsResponse, shopsResponse]) => {
        const parts = (await partsResponse.json()) as PublicResponse<Part>;
        const shops = (await shopsResponse.json()) as PublicResponse<Shop>;
        if (parts.error || shops.error) {
          setError('Esta vitrine está indisponível. Confira o link com a assistência.');
          return;
        }
        setItems(
          (parts.records || [])
            .filter((p) => p.data.published === true && Number(p.data.stock) > 0)
            .map((p) => p.data),
        );
        setShop(shops.records?.[0]?.data || { name: 'ReparoSM', phone: '' });
      })
      .catch(() => setError('Não foi possível carregar a vitrine. Tente novamente.'))
      .finally(() => setLoading(false));
  }, []);
  const categories = useMemo(
    () => [
      'Todos',
      ...Array.from(new Set(items.map((p) => p.category))).filter((value): value is string =>
        Boolean(value),
      ),
    ],
    [items],
  );
  const visible = category === 'Todos' ? items : items.filter((p) => p.category === category);
  const ask = (p: Part) => {
    if (!hasValidWhatsapp(shop.phone))
      return alert('A assistência ainda não cadastrou o WhatsApp.');
    window.open(
      whatsappUrl(
        shop.phone,
        `Olá! Vi ${p.name} na vitrine da ${shop.name || 'ReparoSM'} e tenho interesse. Valor anunciado: ${formatMoney(p.price)}.`,
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
            {categories.map((c) => (
              <button
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
                key={c}
              >
                {c}
              </button>
            ))}
          </nav>
        )}
        {loading ? (
          <div className="store-empty">Carregando a vitrine...</div>
        ) : visible.length ? (
          <div className="store-grid">
            {visible.map((p, i) => (
              <article key={`${p.name}-${i}`}>
                <div>
                  {p.category === 'Capinhas'
                    ? '▣'
                    : p.category === 'Carregadores'
                      ? '⌁'
                      : p.category === 'Acessórios'
                        ? '◇'
                        : '⚙'}
                </div>
                <small>{p.category || 'Produto'}</small>
                <h2>{p.name}</h2>
                <p>{p.stock} unidades disponíveis</p>
                <strong>{formatMoney(p.price)}</strong>
                <button onClick={() => ask(p)}>Pedir pelo WhatsApp</button>
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
