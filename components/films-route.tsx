'use client';

import { useMemo, useState } from 'react';
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
import FilterPills from '@/components/ui/filter-pills';
import { Plus, Search } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { Film } from '@/lib/types';
import { filmCatalog } from '@/lib/film-catalog';

type FilmRow = Film & { id: string; editable: boolean };
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const pageSize = 36;
// Valor do filtro "Minha loja" (não colide com nenhuma marca).
const MINE = '__minha-loja__';
const catalog = filmCatalog.map((record) => ({ id: record.id, ...record.data, editable: false }));

export default function FilmsRoute({ initialFilms }: { initialFilms: FilmRow[] }) {
  const { notify } = useFeedback();
  const [films, setFilms] = useState(() => [...initialFilms, ...catalog]);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('Todas');
  const [mineOnly, setMineOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<FilmRow | null>(null);
  const [draft, setDraft] = useState<Film | null>(null);
  const [page, setPage] = useState(0);
  const brands = useMemo(
    () => [
      'Todas',
      ...Array.from(new Set(films.map((film) => film.brand).filter(Boolean))).sort(
        collator.compare,
      ),
    ],
    [films],
  );
  const customizedModels = useMemo(
    () =>
      new Set(
        films
          .filter((film) => film.editable)
          .map((film) => JSON.stringify([film.brand, film.model])),
      ),
    [films],
  );
  const found = useMemo(
    () =>
      films
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
            collator.compare(left.brand, right.brand) ||
            collator.compare(left.model, right.model) ||
            Number(right.editable) - Number(left.editable) ||
            left.id.localeCompare(right.id),
        ),
    [films, search, brand, mineOnly],
  );
  const lastPage = Math.max(0, Math.ceil(found.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = found.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
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
      notify(id ? 'Compatibilidade atualizada.' : 'Compatibilidade adicionada.', 'success');
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
        description="Descubra qual película serve em cada aparelho."
        action={
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Nova compatibilidade
          </Button>
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
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-8"
                id="film-search"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Ex.: A03, iPhone 13, Moto G54..."
                type="search"
                value={search}
              />
            </div>
          </div>
          <FilterPills
            label="Filtrar por marca"
            onChange={(item) => {
              setMineOnly(item === MINE);
              setBrand(item === MINE ? 'Todas' : item);
              setPage(0);
            }}
            options={[
              {
                value: MINE,
                label: 'Minha loja',
                count: films.filter((film) => film.editable).length,
              },
              ...brands.map((item) => ({ value: item, label: item })),
            ]}
            value={mineOnly ? MINE : brand}
          />
        </CardContent>
      </Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {found.length} compatibilidades · Página {currentPage + 1} de {lastPage + 1}
        </p>
        {lastPage > 0 && (
          <nav aria-label="Páginas de películas" className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Próxima
            </Button>
          </nav>
        )}
      </div>
      {found.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((film) => {
            const customized = customizedModels.has(JSON.stringify([film.brand, film.model]));
            return (
              <Card key={film.id}>
                <CardContent className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{film.brand}</span>
                  <h3 className="font-semibold">{film.model}</h3>
                  <p className="text-sm text-muted-foreground">
                    Serve também em{' '}
                    <span className="font-medium text-foreground">{film.compatible}</span>
                  </p>
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
                        <Badge variant="neutral">Catálogo</Badge>
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
