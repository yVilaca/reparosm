'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Tutorial } from '@/lib/types';

type TutorialRow = Tutorial & { id: string };

const guides = [
  ['Começando', 'Cadastre sua assistência e o primeiro cliente.'],
  ['Ordens de serviço', 'Crie uma OS, registre custos e acompanhe no Grid ou Kanban.'],
  ['Estoque', 'Cadastre produtos, custos, preços e disponibilidade.'],
  ['Financeiro', 'Registre entradas e despesas para acompanhar o resultado.'],
  ['Orçamentos', 'Envie propostas e registre a decisão do cliente.'],
  ['Garantias', 'Acompanhe aparelhos entregues e retornos.'],
] as const;

const categories = [
  'Começando',
  'Ordens de serviço',
  'Estoque',
  'Financeiro',
  'Orçamentos',
  'Garantias',
  'Outros',
];

export default function SupportRoute({ initialTutorials }: { initialTutorials: TutorialRow[] }) {
  const { notify } = useFeedback();
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
      notify('Tutorial adicionado.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível adicionar o tutorial.',
        'error',
      );
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
      <PageHeader
        title="Tutoriais & suporte"
        description="Guias e vídeos carregados no servidor para a conta atual."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <Card className="mb-4 gap-3 bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Central de ajuda
            </p>
            <h2 className="text-lg font-semibold">Aprenda a usar o ReparoSM</h2>
          </div>
          <Button onClick={open} size="sm" variant="secondary">
            Adicionar vídeo
          </Button>
        </CardContent>
      </Card>
      {tutorials.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Vídeos da assistência</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card key={tutorial.id}>
                <CardContent className="grid gap-2">
                  {youtube(tutorial.url) ? (
                    <iframe
                      allowFullScreen
                      className="aspect-video w-full rounded-lg"
                      src={`https://www.youtube.com/embed/${youtube(tutorial.url)}`}
                      title={tutorial.title}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-2xl">
                      ▶
                    </div>
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {tutorial.category || 'Tutorial'}
                  </span>
                  <h3 className="font-semibold">{tutorial.title}</h3>
                  <p className="text-sm text-muted-foreground">{tutorial.description}</p>
                  <Button asChild className="w-fit" size="sm" variant="outline">
                    <a href={tutorial.url} rel="noreferrer" target="_blank">
                      Assistir vídeo →
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      <h2 className="mb-3 text-lg font-semibold">Guias rápidos</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide, index) => (
          <Card key={guide[0]}>
            <CardContent className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                GUIA RÁPIDO · {index + 1}
              </span>
              <h3 className="font-semibold">{guide[0]}</h3>
              <p className="text-sm text-muted-foreground">{guide[1]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong>Como adicionar um vídeo?</strong>
            <p className="text-sm text-muted-foreground">
              Clique em &quot;Adicionar vídeo&quot;, cole o link do YouTube e preencha o título. Ele
              aparecerá nesta página automaticamente.
            </p>
          </div>
          <Button onClick={open} variant="outline">
            Adicionar vídeo
          </Button>
        </CardContent>
      </Card>
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
  const [category, setCategory] = useState(categories[0]);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void save({
              title: String(form.get('title') || ''),
              url: String(form.get('url') || ''),
              category,
              description: String(form.get('description') || ''),
              createdAt: new Date().toISOString(),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Adicionar vídeo</DialogTitle>
            <DialogDescription>Publique um tutorial na central de ajuda.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-title">Título do vídeo *</Label>
            <Input
              id="tutorial-title"
              name="title"
              placeholder="Ex.: Como criar uma ordem de serviço"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-url">Link do YouTube *</Label>
            <Input
              id="tutorial-url"
              name="url"
              placeholder="https://youtube.com/watch?v=..."
              required
              type="url"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-category">Categoria</Label>
            <Select onValueChange={setCategory} value={category}>
              <SelectTrigger className="w-full" id="tutorial-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tutorial-description">Descrição</Label>
            <Textarea
              id="tutorial-description"
              name="description"
              placeholder="Explique rapidamente o que o usuário aprenderá."
            />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button type="submit">Adicionar vídeo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
