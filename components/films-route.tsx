'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import type { Film } from '@/lib/types';

type FilmRow = Film & { id: string; editable: boolean };

export default function FilmsRoute({ initialFilms }: { initialFilms: FilmRow[] }) {
  const { notify } = useFeedback();
  const [films, setFilms] = useState(initialFilms);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('Todas');
  const [mineOnly, setMineOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<FilmRow | null>(null);
  const [draft, setDraft] = useState<Film | null>(null);
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const brands = [
    'Todas',
    ...Array.from(new Set(films.map((film) => film.brand).filter(Boolean))).sort(collator.compare),
  ];
  const found = films
    .filter(
      (film) =>
        (!mineOnly || film.editable) &&
        (brand === 'Todas' || film.brand === brand) &&
        `${film.brand} ${film.model} ${film.compatible}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (left, right) =>
        collator.compare(left.brand, right.brand) || collator.compare(left.model, right.model),
    );
  const hasShopFilms = films.some((film) => film.editable);
  const save = async (data: Film, id?: string) => {
    try {
      const response = await fetch('/api/films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, ...(id ? { id } : {}) }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Film };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a compatibilidade.');
      const saved = { id: result.record.id, ...result.record.data, editable: true };
      setFilms((current) =>
        id ? current.map((film) => (film.id === id ? saved : film)) : [saved, ...current],
      );
      setModal(false);
      setEditing(null);
      setDraft(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a compatibilidade.',
        'error',
      );
    }
  };
  const create = () => {
    setEditing(null);
    setDraft(null);
    setModal(true);
  };
  const edit = (film: FilmRow) => {
    setEditing(film);
    setDraft(null);
    setModal(true);
  };
  const customize = (film: FilmRow) => {
    setEditing(null);
    setDraft({
      brand: film.brand,
      model: film.model,
      compatible: film.compatible,
      size: film.size,
    });
    setModal(true);
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Películas</h1>
          <small>
            Filtre “Minha loja” para editar seus itens; personalize os demais com “Adicionar à
            loja”.
          </small>
        </div>
        <div className="top-actions">
          <button className="primary" type="button" onClick={create}>
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
        <button
          type="button"
          className={mineOnly ? 'active' : ''}
          onClick={() => {
            setMineOnly((value) => !value);
            setBrand('Todas');
          }}
        >
          Minha loja ({films.filter((film) => film.editable).length})
        </button>
        {brands.map((item) => (
          <button
            type="button"
            className={brand === item ? 'active' : ''}
            onClick={() => {
              setBrand(item);
              setMineOnly(false);
            }}
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
                <div className="row-actions">
                  {film.editable && (
                    <>
                      <span className="tag ready">Da loja</span>
                      <button
                        type="button"
                        aria-label={`Editar compatibilidade ${film.brand} ${film.model}`}
                        onClick={() => edit(film)}
                      >
                        Editar
                      </button>
                    </>
                  )}
                  {!film.editable && (
                    <>
                      <span className="tag">Catálogo</span>
                      {films.some(
                        (own) =>
                          own.editable && own.brand === film.brand && own.model === film.model,
                      ) ? (
                        <span className="tag ready">Personalizada</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Adicionar ${film.brand} ${film.model} à loja para editar`}
                          onClick={() => customize(film)}
                        >
                          Adicionar à loja
                        </button>
                      )}
                    </>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <article className="empty-state">
          <div>✦</div>
          <h2>
            {!films.length
              ? 'Nenhuma compatibilidade cadastrada'
              : mineOnly && !hasShopFilms
                ? 'Sua loja ainda não tem itens editáveis'
                : 'Nenhum resultado encontrado'}
          </h2>
          <p>
            {!films.length
              ? 'Cadastre equivalências entre modelos de celulares.'
              : mineOnly && !hasShopFilms
                ? 'Volte ao catálogo e use “Adicionar à loja” para criar sua primeira versão editável.'
                : 'Tente outro modelo ou marca.'}
          </p>
          <button className="primary" type="button" onClick={create}>
            Cadastrar compatibilidade
          </button>
        </article>
      )}
      {modal && (
        <FilmModal
          item={editing || undefined}
          initial={draft || undefined}
          close={() => {
            setModal(false);
            setEditing(null);
            setDraft(null);
          }}
          save={save}
        />
      )}
    </>
  );
}

function FilmModal({
  item,
  initial,
  close,
  save,
}: {
  item?: FilmRow;
  initial?: Film;
  close: () => void;
  save: (data: Film, id?: string) => Promise<void>;
}) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(
            {
              brand: String(form.get('brand') || '').trim(),
              model: String(form.get('model') || '').trim(),
              compatible: String(form.get('compatible') || '').trim(),
              size: String(form.get('size') || '').trim(),
            },
            item?.id,
          );
        }}
      >
        <div className="modal-title">
          <div>
            <span>▯</span>
            <div>
              <h2>
                {item
                  ? 'Editar compatibilidade'
                  : initial
                    ? 'Adicionar à minha loja'
                    : 'Nova compatibilidade'}
              </h2>
              <p>
                {initial
                  ? 'Revise os dados; esta versão poderá ser editada pela sua loja.'
                  : 'Cadastre equivalências entre aparelhos.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Marca
          <input
            name="brand"
            required
            placeholder="Ex.: Apple"
            defaultValue={item?.brand || initial?.brand || ''}
          />
        </label>
        <label>
          Modelo principal
          <input
            name="model"
            required
            placeholder="Ex.: iPhone 13"
            defaultValue={item?.model || initial?.model || ''}
          />
        </label>
        <label>
          Modelos compatíveis
          <textarea
            name="compatible"
            required
            placeholder="Ex.: iPhone 13 Pro, iPhone 14"
            defaultValue={item?.compatible || initial?.compatible || ''}
          />
        </label>
        <label>
          Tamanho / observação
          <input
            name="size"
            placeholder="Ex.: 6,1 polegadas"
            defaultValue={item?.size || initial?.size || ''}
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">
            {item
              ? 'Salvar alterações'
              : initial
                ? 'Adicionar e editar na loja'
                : 'Salvar compatibilidade'}
          </button>
        </div>
      </form>
    </div>
  );
}
