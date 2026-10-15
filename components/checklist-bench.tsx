'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from 'cn';
import {
  ArrowLeft,
  Check,
  Copy,
  MessageCircle,
  Minus,
  PenLine,
  Power,
  PowerOff,
  Printer,
  QrCode as QrIcon,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import DeviceDiagram, { insideKeys, sideOf, stateBg, type Side } from '@/components/device-diagram';
import { useFeedback } from '@/components/feedback';
import QrCode from '@/components/qr-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import {
  applyPatch,
  checkDef,
  checkGroups,
  checklistSummary,
  checks,
  damageKinds,
  damageLabel,
  type CheckKey,
  type CheckState,
  type Checklist,
  type ChecklistPatch,
  type DamageKind,
  type DeviceTestSession,
} from '@/lib/order-checklist';
import { relativeTime } from '@/lib/order-tracking';

type BenchOrder = { id: string; code: string; device: string; customer: string; phone?: string };

const answers: { state: CheckState; label: string; key: string; icon: typeof Check; on: string }[] =
  [
    {
      state: 'ok',
      label: 'Funciona',
      key: '1',
      icon: Check,
      on: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
      state: 'fail',
      label: 'Defeito',
      key: '2',
      icon: X,
      on: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    },
    { state: 'skip', label: 'Não testado', key: '3', icon: Minus, on: 'bg-muted text-foreground' },
  ];

/** Junta duas alterações; a mais nova vale onde as duas mexem. */
const mergePatch = (older: ChecklistPatch | null, newer: ChecklistPatch): ChecklistPatch => {
  const merged = { ...older, ...newer };
  if (older?.items || newer.items) merged.items = { ...older?.items, ...newer.items };
  return merged;
};

const LIVE_SECONDS = 30;
const POLL_MS = 2500;

/** A bancada de testes: o estado do aparelho antes de mexer nele. */
export default function ChecklistBench({
  order,
  initial,
}: {
  order: BenchOrder;
  initial: { checklist: Checklist; session: DeviceTestSession };
}) {
  const router = useRouter();
  const { notify, confirm } = useFeedback();
  const endpoint = `/api/orders/${encodeURIComponent(order.id)}/checklist`;
  const [checklist, setChecklist] = useState(initial.checklist);
  const [session, setSession] = useState(initial.session);
  const [side, setSide] = useState<Side>('front');
  const [focus, setFocus] = useState<CheckKey>();
  const [marking, setMarking] = useState(false);
  const [markKind, setMarkKind] = useState<DamageKind>('crack');
  const [selectedMark, setSelectedMark] = useState<string>();
  const [arrived, setArrived] = useState<CheckKey[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testUrl, setTestUrl] = useState('');
  const [busy, setBusy] = useState('');
  const rows = useRef(new Map<CheckKey, HTMLLIElement>());
  const notes = useRef(new Map<CheckKey, HTMLInputElement>());
  // Depois de "Defeito", o cursor vai para "qual?" assim que o campo aparece.
  const noteWanted = useRef<CheckKey>(undefined);
  const focusNote = (key: CheckKey) => {
    const node = notes.current.get(key);
    if (node) node.focus();
    else noteWanted.current = key;
  };

  const summary = checklistSummary(checklist);
  const off = checklist.powersOn === false;
  const states = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(checklist.items).map(([key, item]) => [key, item?.state]),
      ) as Partial<Record<CheckKey, CheckState>>,
    [checklist.items],
  );
  const fromDevice = checks.filter((check) => checklist.items[check.key]?.by === 'device').length;

  // ---- Gravação: uma de cada vez, juntando o que chega no meio. ----
  const pending = useRef<ChecklistPatch | null>(null);
  const inFlight = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A fila se chama de novo (depois de gravar, ou para tentar outra vez): pelo ref.
  const again = useRef<() => void>(() => {});
  const flush = useCallback(async () => {
    clearTimeout(retry.current);
    retry.current = undefined;
    if (inFlight.current || !pending.current) return;
    const patch = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState('saving');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error('save');
      const result = (await response.json()) as {
        checklist: Checklist;
        session: DeviceTestSession;
      };
      // Com outra alteração na fila, a tela já mostra o que vem depois.
      if (!pending.current) setChecklist(result.checklist);
      setSession(result.session);
      setSaveState(pending.current ? 'saving' : 'saved');
    } catch {
      pending.current = mergePatch(patch, pending.current ?? {});
      setSaveState('error');
      clearTimeout(retry.current);
      retry.current = setTimeout(() => again.current(), 4000);
    } finally {
      inFlight.current = false;
    }
    if (pending.current && !retry.current) again.current();
  }, [endpoint]);
  useEffect(() => {
    again.current = () => void flush();
  }, [flush]);

  const change = useCallback(
    (patch: ChecklistPatch) => {
      setChecklist((current) => applyPatch(current, patch, new Date().toISOString()));
      pending.current = mergePatch(pending.current, patch);
      void flush();
    },
    [flush],
  );

  // Texto (observações, notas): grava depois de uma pausa na digitação.
  const typing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const changeText = (patch: ChecklistPatch) => {
    setChecklist((current) => applyPatch(current, patch, new Date().toISOString()));
    pending.current = mergePatch(pending.current, patch);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => void flush(), 700);
  };

  useEffect(
    () => () => {
      clearTimeout(retry.current);
      clearTimeout(typing.current);
    },
    [],
  );

  // ---- Ao vivo: enquanto o teste pelo aparelho vale, a bancada consulta. ----
  const latest = useRef(checklist);
  useEffect(() => {
    latest.current = checklist;
  }, [checklist]);
  // Relógio para "conectado agora": anda junto com a consulta ao vivo.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!session.active) return;
    let stopped = false;
    const poll = async () => {
      if (document.hidden || pending.current || inFlight.current) return;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok || stopped || pending.current || inFlight.current) return;
        const result = (await response.json()) as {
          checklist: Checklist;
          session: DeviceTestSession;
        };
        const before = latest.current.items;
        const fresh = checks
          .map((check) => check.key)
          .filter((key) => {
            const item = result.checklist.items[key];
            return item?.by === 'device' && item.at !== before[key]?.at;
          });
        setChecklist(result.checklist);
        setSession(result.session);
        if (fresh.length) {
          setArrived(fresh);
          setAnnouncement(
            fresh
              .map((key) => {
                const state = result.checklist.items[key]?.state;
                return `${checkDef(key)?.label}: ${state === 'ok' ? 'funciona' : 'defeito'}`;
              })
              .join('. '),
          );
          setTimeout(() => setArrived([]), 2600);
        }
      } catch {
        // Sem conexão agora: a próxima volta tenta de novo.
      }
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      void poll();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [endpoint, session.active]);

  // ---- Testes ----
  const answer = (key: CheckKey, state: CheckState) => {
    const current = checklist.items[key];
    const same = current?.state === state && current.by === 'shop';
    change({
      items: {
        [key]: same
          ? null
          : { state, ...(current?.note && state === 'fail' ? { note: current.note } : {}) },
      },
    });
  };

  const keys = checks.map((check) => check.key);
  const goTo = (key: CheckKey | undefined) => {
    if (!key) return;
    setFocus(key);
    const target = sideOf(key);
    if (target) setSide(target);
    const row = rows.current.get(key);
    row?.focus();
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const nextOf = (key: CheckKey) => {
    const index = keys.indexOf(key);
    return keys.slice(index + 1).find((next) => !checklist.items[next]) ?? keys[index + 1];
  };

  const onRowKey = (key: CheckKey) => (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (event.target instanceof HTMLInputElement) {
      if (event.key === 'Enter') {
        event.preventDefault();
        goTo(nextOf(key));
      }
      return;
    }
    const index = keys.indexOf(key);
    if (event.key === 'ArrowDown' || event.key === 'j') {
      event.preventDefault();
      goTo(keys[Math.min(index + 1, keys.length - 1)]);
    } else if (event.key === 'ArrowUp' || event.key === 'k') {
      event.preventDefault();
      goTo(keys[Math.max(index - 1, 0)]);
    } else {
      const picked = answers.find((option) => option.key === event.key);
      if (!picked || off) return;
      event.preventDefault();
      answer(key, picked.state);
      // Defeito: o cursor vai para "qual?". Os outros descem para o próximo.
      if (picked.state === 'fail') focusNote(key);
      else goTo(nextOf(key));
    }
  };

  // ---- Avarias ----
  const placeMark = (markSide: Side, x: number, y: number) => {
    const id = `m-${crypto.randomUUID().slice(0, 8)}`;
    change({ marks: [...checklist.marks, { id, side: markSide, x, y, kind: markKind }] });
    setSelectedMark(id);
  };
  const editMark = (id: string, patch: { note?: string; kind?: DamageKind }, typed = false) => {
    const marks = checklist.marks.map((mark) =>
      mark.id === id
        ? { ...mark, ...patch, ...(patch.note === '' ? { note: undefined } : {}) }
        : mark,
    );
    if (typed) changeText({ marks });
    else change({ marks });
  };

  // ---- Teste pelo aparelho ----
  const deviceEndpoint = `${endpoint}/device`;
  const startTest = async () => {
    setBusy('start');
    try {
      const response = await fetch(deviceEndpoint, { method: 'POST' });
      const result = (await response.json()) as {
        url?: string;
        session?: DeviceTestSession;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error || 'Não foi possível gerar o QR code.');
      setTestUrl(result.url);
      if (result.session) setSession(result.session);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível gerar o QR code.', 'error');
    } finally {
      setBusy('');
    }
  };
  const endTest = async () => {
    setBusy('end');
    try {
      const response = await fetch(deviceEndpoint, { method: 'DELETE' });
      const result = (await response.json()) as { session?: DeviceTestSession };
      if (result.session) setSession(result.session);
      setTestUrl('');
    } finally {
      setBusy('');
    }
  };
  const sendTest = () => {
    if (!hasValidWhatsapp(order.phone)) {
      notify('Cadastre um WhatsApp válido nesta ordem, ou use o QR code.', 'error');
      return;
    }
    window.open(
      whatsappUrl(
        order.phone,
        `Olá! Abra este link no aparelho que está na assistência para testá-lo (${order.code}): ${testUrl}`,
      ),
      '_blank',
      'noopener,noreferrer',
    );
  };
  const copyTest = async () => {
    try {
      await navigator.clipboard.writeText(testUrl);
      notify('Link copiado.', 'success');
    } catch {
      notify('Não foi possível copiar. Use o QR code.', 'error');
    }
  };

  const seenRecently =
    session.lastSeenAt && now - new Date(session.lastSeenAt).getTime() < LIVE_SECONDS * 1000;
  const liveText = !session.openedAt
    ? 'Aguardando o aparelho abrir o link…'
    : `${seenRecently ? 'Aparelho conectado.' : `Último contato ${relativeTime(session.lastSeenAt!)}.`} ${
        fromDevice === 1 ? '1 resultado recebido.' : `${fromDevice} resultados recebidos.`
      }`;

  // ---- Concluir ----
  const missing = off ? 0 : checks.length - summary.answered;
  const complete = async () => {
    if (
      missing > 0 &&
      !(await confirm(
        `${missing === 1 ? 'Falta 1 teste' : `Faltam ${missing} testes`}. Concluir assim mesmo? O que faltou fica como não respondido.`,
      ))
    )
      return;
    change({ completed: true });
    notify('Checklist concluído.', 'success');
    router.push(`/ordens?busca=${encodeURIComponent(order.code)}`);
  };

  const saveText = {
    idle: checklist.completedAt
      ? `Concluído ${relativeTime(checklist.completedAt)}`
      : 'Salva sozinho',
    saving: 'Salvando…',
    saved: 'Salvo',
    error: 'Sem conexão. Tentando salvar de novo…',
  }[saveState];

  return (
    // No computador, a bancada ocupa a tela: o aparelho fica à vista e a lista rola ao lado.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:h-[calc(100svh-4rem)]">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            href={`/ordens?busca=${encodeURIComponent(order.code)}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar para {order.code}
          </Link>
          <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">
            Checklist de entrada
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {order.device || 'Aparelho'} · {order.customer || 'Cliente'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link
              href={`/ordens/${encodeURIComponent(order.id)}/checklist/imprimir`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Printer aria-hidden="true" />
              Imprimir para assinatura
            </Link>
          </Button>
          <span
            aria-live="polite"
            className={cn(
              'text-sm',
              saveState === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {saveText}
          </span>
          <Button onClick={() => void complete()} size="lg" type="button">
            <Check aria-hidden="true" />
            Concluir checklist
          </Button>
        </div>
      </header>

      {/* Resumo: um segmento por teste, como o trilho das etapas da OS. */}
      <section aria-label="Resumo" className="grid gap-3 rounded-xl border bg-card p-4">
        <div aria-hidden="true" className="flex gap-[3px]">
          {checks.map((check) => (
            <span
              key={check.key}
              className={cn(
                'h-2 flex-1 rounded-full transition-colors duration-500',
                off ? stateBg.none : stateBg[states[check.key] ?? 'none'],
              )}
              title={check.label}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-medium">{summary.text}</p>
          {!off && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {summary.answered} de {summary.total} respondidos
            </p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-stretch">
        {/* Coluna do aparelho */}
        <div className="grid content-start gap-4 lg:min-h-0 lg:overflow-y-auto">
          <section
            aria-labelledby="powers-title"
            className="grid gap-3 rounded-xl border bg-card p-4"
          >
            <h2 id="powers-title" className="font-semibold">
              O aparelho liga?
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: 'Liga', icon: Power },
                { value: false, label: 'Não liga', icon: PowerOff },
              ].map((option) => {
                const pressed = checklist.powersOn === option.value;
                return (
                  <button
                    key={option.label}
                    aria-pressed={pressed}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      pressed
                        ? option.value
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : 'hover:bg-muted',
                    )}
                    onClick={() => change({ powersOn: pressed ? null : option.value })}
                    type="button"
                  >
                    <option.icon aria-hidden="true" className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-labelledby="device-title"
            className="grid gap-4 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="device-title" className="font-semibold">
                O aparelho
              </h2>
              <div
                className="flex rounded-lg bg-muted p-0.5"
                role="group"
                aria-label="Lado do aparelho"
              >
                {(['front', 'back'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={side === value}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      side === value
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setSide(value)}
                    type="button"
                  >
                    {value === 'front' ? 'Frente' : 'Verso'}
                  </button>
                ))}
              </div>
            </div>

            <DeviceDiagram
              className="h-[min(26rem,58vh)]"
              disabled={off}
              focus={focus}
              marking={marking}
              marks={checklist.marks}
              onPlace={placeMark}
              onSpot={goTo}
              pulse={arrived}
              selectedMark={selectedMark}
              side={side}
              states={states}
            />

            {!off && (
              <div
                className="flex flex-wrap items-center justify-center gap-1.5"
                aria-label="Por dentro"
              >
                <span className="text-xs text-muted-foreground">Por dentro:</span>
                {insideKeys.map((key) => (
                  <button
                    key={key}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      focus === key && 'border-foreground/40',
                    )}
                    onClick={() => goTo(key)}
                    type="button"
                  >
                    <span className={cn('size-2 rounded-full', stateBg[states[key] ?? 'none'])} />
                    {checkDef(key)?.label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 border-t pt-3">
              <Button
                aria-pressed={marking}
                className={cn(
                  marking && 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                )}
                onClick={() => setMarking((value) => !value)}
                type="button"
                variant="outline"
              >
                <PenLine aria-hidden="true" />
                {marking ? 'Pronto, parar de marcar' : 'Marcar avaria no desenho'}
              </Button>
              {marking && (
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de avaria">
                    {damageKinds.map((kind) => (
                      <button
                        key={kind.value}
                        aria-pressed={markKind === kind.value}
                        className={cn(
                          'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          markKind === kind.value
                            ? 'border-foreground bg-foreground text-background'
                            : 'hover:bg-muted',
                        )}
                        onClick={() => setMarkKind(kind.value)}
                        type="button"
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique no desenho onde está a avaria. Vire para o verso para marcar atrás.
                  </p>
                </div>
              )}
              {checklist.marks.length > 0 && (
                <ul className="grid gap-2" aria-label="Avarias marcadas">
                  {checklist.marks.map((mark, index) => (
                    <li
                      key={mark.id}
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-1.5',
                        selectedMark === mark.id && 'border-rose-500/40',
                      )}
                      onFocus={() => {
                        setSelectedMark(mark.id);
                        setSide(mark.side);
                      }}
                    >
                      <span className="text-xs font-semibold text-rose-700 tabular-nums dark:text-rose-300">
                        {index + 1}. {damageLabel(mark.kind)}
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          ({mark.side === 'front' ? 'frente' : 'verso'})
                        </span>
                      </span>
                      <Input
                        aria-label={`Detalhe da avaria ${index + 1}`}
                        className="h-7 text-sm"
                        maxLength={160}
                        onChange={(event) => editMark(mark.id, { note: event.target.value }, true)}
                        placeholder="Detalhe (opcional)"
                        value={mark.note ?? ''}
                      />
                      <Button
                        aria-label={`Remover avaria ${index + 1}`}
                        onClick={() =>
                          change({ marks: checklist.marks.filter((item) => item.id !== mark.id) })
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Lista de testes */}
        <div className="grid content-start gap-6 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {!off && (
            <section
              aria-labelledby="self-test-title"
              className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
            >
              {testUrl && session.active && (
                <QrCode
                  className="w-44 justify-self-center rounded-lg"
                  label={`QR code do teste do aparelho da ${order.code}`}
                  value={testUrl}
                />
              )}
              <div className="grid gap-3 sm:col-start-2">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    <Smartphone aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h2 id="self-test-title" className="font-semibold">
                      Teste pelo próprio aparelho
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {testUrl && session.active
                        ? 'Aponte a câmera do aparelho para o código. Enquanto ele testa tela, som e sensores, você confere os botões e a biometria.'
                        : 'Se o aparelho liga, ele mesmo testa tela, som, câmeras e sensores pelo navegador, e o resultado aparece aqui na hora.'}
                    </p>
                  </div>
                </div>
                {!testUrl && session.active && (
                  <p className="text-sm text-muted-foreground">
                    O código anterior continua valendo no aparelho. Para mostrar um QR code de novo,
                    gere outro.
                  </p>
                )}
                {session.active && (
                  <p aria-live="polite" className="flex items-center gap-2 text-sm">
                    <span className="relative flex size-2.5 shrink-0">
                      <span
                        className={cn(
                          'absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden',
                          seenRecently ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                      />
                      <span
                        className={cn(
                          'relative inline-flex size-2.5 rounded-full',
                          seenRecently ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                      />
                    </span>
                    {liveText}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(!session.active || !testUrl) && (
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() => void startTest()}
                      type="button"
                      variant="outline"
                    >
                      <QrIcon aria-hidden="true" />
                      {busy === 'start'
                        ? 'Gerando…'
                        : session.active
                          ? 'Gerar novo QR code'
                          : 'Gerar QR code'}
                    </Button>
                  )}
                  {testUrl && session.active && (
                    <>
                      <Button onClick={sendTest} type="button" variant="outline">
                        <MessageCircle aria-hidden="true" />
                        Enviar no WhatsApp
                      </Button>
                      <Button onClick={() => void copyTest()} type="button" variant="outline">
                        <Copy aria-hidden="true" />
                        Copiar link
                      </Button>
                    </>
                  )}
                  {session.active && (
                    <Button
                      className="text-muted-foreground"
                      disabled={Boolean(busy)}
                      onClick={() => void endTest()}
                      type="button"
                      variant="ghost"
                    >
                      Encerrar teste
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}

          {off ? (
            <section className="grid gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
              <h2 className="font-semibold">O aparelho não liga</h2>
              <p className="text-sm text-muted-foreground">
                Sem testes de funcionamento: tudo fica como não foi possível testar. Marque no
                desenho as avarias que dá para ver e anote o que mais chamar atenção.
              </p>
            </section>
          ) : (
            checkGroups.map((group) => (
              <section key={group} aria-labelledby={`group-${group}`} className="grid gap-1">
                <h2
                  id={`group-${group}`}
                  className="px-3 text-xs font-semibold tracking-wide text-muted-foreground"
                >
                  {group}
                </h2>
                <ul className="grid gap-1 rounded-xl border bg-card p-1.5">
                  {checks
                    .filter((check) => check.group === group)
                    .map((check) => {
                      const item = checklist.items[check.key];
                      const fresh = arrived.includes(check.key);
                      return (
                        <li
                          key={check.key}
                          ref={(node) => {
                            if (node) rows.current.set(check.key, node);
                            else rows.current.delete(check.key);
                          }}
                          aria-label={`${check.label}: ${
                            item
                              ? answers.find((option) => option.state === item.state)?.label
                              : 'sem resposta'
                          }`}
                          className={cn(
                            'grid gap-2 rounded-lg px-3 py-2.5 outline-none transition-[background-color,box-shadow] duration-500 focus-visible:ring-3 focus-visible:ring-ring/50',
                            focus === check.key && 'bg-muted/60',
                            fresh && 'bg-emerald-500/10 ring-2 ring-emerald-500/40',
                          )}
                          onFocus={(event) => {
                            if (event.target !== event.currentTarget) return;
                            setFocus(check.key);
                            const target = sideOf(check.key);
                            if (target) setSide(target);
                          }}
                          onKeyDown={onRowKey(check.key)}
                          tabIndex={0}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'size-2.5 shrink-0 rounded-full',
                                item
                                  ? stateBg[item.state]
                                  : 'border border-dashed border-muted-foreground/60',
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-x-2 font-medium">
                                {check.label}
                                {item?.by === 'device' && (
                                  <Badge variant="neutral">
                                    <Smartphone aria-hidden="true" />
                                    pelo aparelho
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{check.how}</p>
                            </div>
                            <div
                              aria-label={`Resultado: ${check.label}`}
                              className="flex shrink-0 gap-0.5 rounded-lg border bg-background p-0.5"
                              role="group"
                            >
                              {answers.map((option) => {
                                const pressed = item?.state === option.state;
                                return (
                                  <button
                                    key={option.state}
                                    aria-keyshortcuts={option.key}
                                    aria-pressed={pressed}
                                    className={cn(
                                      'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                                      pressed
                                        ? option.on
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}
                                    onClick={() => {
                                      setFocus(check.key);
                                      answer(check.key, option.state);
                                      if (option.state === 'fail' && !pressed) focusNote(check.key);
                                    }}
                                    tabIndex={-1}
                                    title={`${option.label} (${option.key})`}
                                    type="button"
                                  >
                                    <option.icon aria-hidden="true" className="size-4" />
                                    <span className="max-sm:sr-only">{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {item?.state === 'fail' && (
                            <Input
                              ref={(node) => {
                                if (!node) return void notes.current.delete(check.key);
                                notes.current.set(check.key, node);
                                if (noteWanted.current === check.key) {
                                  noteWanted.current = undefined;
                                  node.focus();
                                }
                              }}
                              aria-label={`Qual o defeito em ${check.label}?`}
                              className="ml-5.5 w-auto"
                              maxLength={160}
                              onChange={(event) =>
                                changeText({
                                  items: {
                                    [check.key]: { state: 'fail', note: event.target.value },
                                  },
                                })
                              }
                              placeholder="Qual o defeito? Ex.: falha no canto de cima"
                              value={item.note ?? ''}
                            />
                          )}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))
          )}

          <section aria-labelledby="notes-title" className="grid gap-2">
            <h2 id="notes-title" className="px-1 text-sm font-semibold">
              Observações do estado do aparelho
            </h2>
            <Textarea
              maxLength={1000}
              onChange={(event) => changeText({ notes: event.target.value })}
              placeholder="Ex.: película trincada, veio sem chip, capinha ficou com o cliente."
              value={checklist.notes ?? ''}
            />
          </section>

          {!off && (
            <p className="px-1 text-xs text-muted-foreground">
              Pelo teclado: <Kbd>↑</Kbd> <Kbd>↓</Kbd> mudam de teste, <Kbd>1</Kbd> funciona,{' '}
              <Kbd>2</Kbd> defeito, <Kbd>3</Kbd> não testado. A resposta já desce para o próximo.
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[0.7rem] font-medium text-foreground">
      {children}
    </kbd>
  );
}
