'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import type { Film } from '@/lib/types';

type FilmRow = Film & { id: string };

export default function FilmsRoute({ initialFilms }: { initialFilms: FilmRow[] }) {
  const { notify } = useFeedback();
  const [films, setFilms] = useState(initialFilms);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('Todas');
  const [modal, setModal] = useState(false);
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const brands = [
    'Todas',
    ...Array.from(new Set(films.map((film) => film.brand).filter(Boolean))).sort(collator.compare),
  ];
  const found = films
    .filter(
      (film) =>
        (brand === 'Todas' || film.brand === brand) &&
        `${film.brand} ${film.model} ${film.compatible}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (left, right) =>
        collator.compare(left.brand, right.brand) || collator.compare(left.model, right.model),
    );
  const save = async (data: Film) => {
    try {
      const response = await fetch('/api/films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Film };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a compatibilidade.');
      setFilms((current) => [{ id: result.record!.id, ...result.record!.data }, ...current]);
      setModal(false);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a compatibilidade.',
        'error',
      );
    }
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Películas</h1>
          <small>Guia de compatibilidade carregado no servidor para a conta atual.</small>
        </div>
        <div className="top-actions">
          <button className="primary" type="button" onClick={() => setModal(true)}>
            + Compatibilidade
          </button>
          <Link className="top-action-link" href="/">
            ← Painel completo
          </Link>
        </div>
      </header>
      <article className="film-search">
        <div>
          <span>GUIA DE COMPATIBILIDADE</span>
          <h2>Qual película serve neste aparelho?</h2>
          <p>Catálogo organizado por marca e modelo em ordem numérica.</p>
        </div>
        <label>
          ⌕
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: A03, iPhone 13, Moto G54..."
          />
        </label>
      </article>
      <div className="film-brand-tabs">
        {brands.map((item) => (
          <button
            type="button"
            className={brand === item ? 'active' : ''}
            onClick={() => setBrand(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      {found.length ? (
        <div className="film-grid">
          {found.map((film) => (
            <article className="panel" key={film.id}>
              <span>{film.brand}</span>
              <h3>{film.model}</h3>
              <p>Também compatível com:</p>
              <strong>{film.compatible}</strong>
              <footer>
                <small>{film.size || 'Película frontal'}</small>
                <span className="tag ready">Compatível</span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>
            {films.length ? 'Nenhum resultado encontrado' : 'Nenhuma compatibilidade cadastrada'}
          </h2>
          <p>
            {films.length
              ? 'Tente outro modelo ou marca.'
              : 'Cadastre equivalências entre modelos de celulares.'}
          </p>
          <button className="primary" type="button" onClick={() => setModal(true)}>
            Cadastrar compatibilidade
          </button>
        </article>
      )}
      {modal && <FilmModal close={() => setModal(false)} save={save} />}
    </>
  );
}

function FilmModal({ close, save }: { close: () => void; save: (data: Film) => Promise<void> }) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save({
            brand: String(form.get('brand') || '').trim(),
            model: String(form.get('model') || '').trim(),
            compatible: String(form.get('compatible') || '').trim(),
            size: String(form.get('size') || '').trim(),
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>▯</span>
            <div>
              <h2>Películas compatíveis</h2>
              <p>Cadastre equivalências entre aparelhos</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Marca
          <input name="brand" required placeholder="Ex.: Apple" />
        </label>
        <label>
          Modelo principal
          <input name="model" required placeholder="Ex.: iPhone 13" />
        </label>
        <label>
          Modelos compatíveis
          <textarea name="compatible" required placeholder="Ex.: iPhone 13 Pro, iPhone 14" />
        </label>
        <label>
          Tamanho / observação
          <input name="size" placeholder="Ex.: 6,1 polegadas" />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar compatibilidade</button>
        </div>
      </form>
    </div>
  );
}
