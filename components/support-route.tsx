'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Tutorial } from '@/lib/types';

type TutorialRow = Tutorial & { id: string };

const guides = [
  ['Começando', 'Cadastre sua assistência e o primeiro cliente.'],
  ['Ordens de serviço', 'Crie uma OS, registre custos e acompanhe pela Mesa.'],
  ['Estoque', 'Cadastre produtos, custos, preços e disponibilidade.'],
  ['Financeiro', 'Registre entradas e despesas para acompanhar o resultado.'],
  ['Orçamentos', 'Envie propostas e registre a decisão do cliente.'],
  ['Garantias', 'Acompanhe aparelhos entregues e retornos.'],
] as const;

export default function SupportRoute({ initialTutorials }: { initialTutorials: TutorialRow[] }) {
  const [tutorials, setTutorials] = useState(initialTutorials);
  const [modal, setModal] = useState(false);
  const save = async (data: Tutorial) => {
    try {
      const response = await fetch('/api/tutorials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Tutorial };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível adicionar o tutorial.');
      setTutorials((current) => [{ id: result.record!.id, ...result.record!.data }, ...current]);
      setModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível adicionar o tutorial.');
      throw error;
    }
  };
  const open = () => setModal(true);
  const youtube = (url: string) => {
    const match = String(url).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/,
    );
    return match?.[1];
  };
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Tutoriais &amp; suporte</h1>
          <small>Guias e vídeos carregados no servidor para a conta atual.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <div className="support-hero">
        <span>CENTRAL DE AJUDA</span>
        <h2>Aprenda a usar o ReparoSM</h2>
        <button className="support-add" type="button" onClick={open}>
          + Adicionar vídeo
        </button>
      </div>
      {tutorials.length > 0 && (
        <>
          <h2 className="section-title">Vídeos da assistência</h2>
          <div className="tutorial-grid">
            {tutorials.map((tutorial) => (
              <article className="panel" key={tutorial.id}>
                {youtube(tutorial.url) ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${youtube(tutorial.url)}`}
                    title={tutorial.title}
                    allowFullScreen
                  />
                ) : (
                  <div className="video-link">▶</div>
                )}
                <small>{tutorial.category || 'Tutorial'}</small>
                <h3>{tutorial.title}</h3>
                <p>{tutorial.description}</p>
                <a href={tutorial.url} target="_blank" rel="noreferrer">
                  Assistir vídeo →
                </a>
              </article>
            ))}
          </div>
        </>
      )}
      <h2 className="section-title">Guias rápidos</h2>
      <div className="lesson-grid">
        {guides.map((guide, index) => (
          <article className="panel" key={guide[0]}>
            <div>
              <span>{index + 1}</span>▶
            </div>
            <small>GUIA RÁPIDO</small>
            <h3>{guide[0]}</h3>
            <p>{guide[1]}</p>
          </article>
        ))}
      </div>
      <div className="support-contact">
        <div>
          <strong>Como adicionar um vídeo?</strong>
          <span>
            Clique em “Adicionar vídeo”, cole o link do YouTube e preencha o título. Ele aparecerá
            nesta página automaticamente.
          </span>
        </div>
        <button type="button" onClick={open}>
          Adicionar vídeo
        </button>
      </div>
      {modal && <TutorialModal close={() => setModal(false)} save={save} />}
    </>
  );
}

function TutorialModal({
  close,
  save,
}: {
  close: () => void;
  save: (data: Tutorial) => Promise<void>;
}) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save({
            title: String(form.get('title') || ''),
            url: String(form.get('url') || ''),
            category: String(form.get('category') || ''),
            description: String(form.get('description') || ''),
            createdAt: new Date().toISOString(),
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>▶</span>
            <div>
              <h2>Adicionar vídeo</h2>
              <p>Publique um tutorial na central de ajuda</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Título do vídeo *
          <input name="title" required placeholder="Ex.: Como criar uma ordem de serviço" />
        </label>
        <label>
          Link do YouTube *
          <input name="url" type="url" required placeholder="https://youtube.com/watch?v=..." />
        </label>
        <label>
          Categoria
          <select name="category">
            <option>Começando</option>
            <option>Ordens de serviço</option>
            <option>Estoque</option>
            <option>Financeiro</option>
            <option>Orçamentos</option>
            <option>Garantias</option>
            <option>Outros</option>
          </select>
        </label>
        <label>
          Descrição
          <textarea
            name="description"
            placeholder="Explique rapidamente o que o usuário aprenderá."
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Adicionar vídeo</button>
        </div>
      </form>
    </div>
  );
}
