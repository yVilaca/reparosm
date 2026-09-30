'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EmptyState from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
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
  const emptyTitle = !films.length
    ? 'Nenhuma compatibilidade cadastrada'
    : mineOnly && !hasShopFilms
      ? 'Sua loja ainda não tem itens editáveis'
      : 'Nenhum resultado encontrado';
  const emptyDescription = !films.length
    ? 'Cadastre equivalências entre modelos de celulares.'
    : mineOnly && !hasShopFilms
      ? 'Volte ao catálogo e use "Adicionar à loja" para criar sua primeira versão editável.'
      : 'Tente outro modelo ou marca.';
  return (
    <>
      <PageHeader
        title="Películas"
        description='Filtre "Minha loja" para editar seus itens; personalize os demais com "Adicionar à loja".'
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Nova compatibilidade
            </Button>
          </div>
        }
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Qual película serve neste aparelho?</CardTitle>
          <CardDescription>
            Catálogo organizado por marca e modelo em ordem numérica.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="film-search">Buscar películas</Label>
            <Input
              id="film-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: A03, iPhone 13, Moto G54..."
              value={search}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              aria-pressed={mineOnly}
              onClick={() => {
                setMineOnly((value) => !value);
                setBrand('Todas');
              }}
              size="sm"
              variant={mineOnly ? 'default' : 'outline'}
            >
              Minha loja ({films.filter((film) => film.editable).length})
            </Button>
            {brands.map((item) => (
              <Button
                aria-pressed={brand === item}
                key={item}
                onClick={() => {
                  setBrand(item);
                  setMineOnly(false);
                }}
                size="sm"
                variant={brand === item ? 'default' : 'outline'}
              >
                {item}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      {found.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {found.map((film) => {
            const customized = films.some(
              (own) => own.editable && own.brand === film.brand && own.model === film.model,
            );
            return (
              <Card key={film.id}>
                <CardContent className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{film.brand}</span>
                  <h3 className="font-semibold">{film.model}</h3>
                  <p className="text-sm text-muted-foreground">Também compatível com:</p>
                  <strong className="text-sm">{film.compatible}</strong>
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {film.size || 'Película frontal'}
                    </span>
                    {film.editable ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="success">Da loja</Badge>
                        <Button
                          aria-label={`Editar compatibilidade ${film.brand} ${film.model}`}
                          onClick={() => edit(film)}
                          size="sm"
                          variant="outline"
                        >
                          Editar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Catálogo</Badge>
                        {customized ? (
                          <Badge variant="success">Personalizada</Badge>
                        ) : (
                          <Button
                            aria-label={`Adicionar ${film.brand} ${film.model} à loja para editar`}
                            onClick={() => customize(film)}
                            size="sm"
                            variant="outline"
                          >
                            Adicionar à loja
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={<Button onClick={create}>Cadastrar compatibilidade</Button>}
          description={emptyDescription}
          title={emptyTitle}
        />
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
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form
          className="grid gap-6 p-6"
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
          <DialogHeader>
            <DialogTitle>
              {item
                ? 'Editar compatibilidade'
                : initial
                  ? 'Adicionar à minha loja'
                  : 'Nova compatibilidade'}
            </DialogTitle>
            <DialogDescription>
              {initial
                ? 'Revise os dados; esta versão poderá ser editada pela sua loja.'
                : 'Cadastre equivalências entre aparelhos.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="film-brand">Marca</Label>
            <Input
              defaultValue={item?.brand || initial?.brand || ''}
              id="film-brand"
              name="brand"
              placeholder="Ex.: Apple"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-model">Modelo principal</Label>
            <Input
              defaultValue={item?.model || initial?.model || ''}
              id="film-model"
              name="model"
              placeholder="Ex.: iPhone 13"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-compatible">Modelos compatíveis</Label>
            <Textarea
              defaultValue={item?.compatible || initial?.compatible || ''}
              id="film-compatible"
              name="compatible"
              placeholder="Ex.: iPhone 13 Pro, iPhone 14"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="film-size">Tamanho / observação</Label>
            <Input
              defaultValue={item?.size || initial?.size || ''}
              id="film-size"
              name="size"
              placeholder="Ex.: 6,1 polegadas"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button type="submit">
              {item
                ? 'Salvar alterações'
                : initial
                  ? 'Adicionar e editar na loja'
                  : 'Salvar compatibilidade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
