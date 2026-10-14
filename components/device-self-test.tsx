'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from 'cn';
import { Check, Minus, RotateCcw, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  checkDef,
  type CheckKey,
  type DeviceInfo,
  type PublicDeviceTest,
} from '@/lib/order-checklist';

/*
 * O teste que roda no próprio aparelho, pelo navegador. Nada é gravado nem
 * enviado além do resultado de cada etapa (funciona ou defeito) e do modelo da
 * tela; câmera e microfone só mostram ao vivo.
 */

type Outcome = { state: 'ok' | 'fail'; note?: string } | { state: 'skip'; note: string };
type StepProps = { done: (outcome: Outcome) => void };

const flow = [
  'touch',
  'display',
  'speaker',
  'microphone',
  'rear-camera',
  'front-camera',
  'flash',
  'vibration',
  'motion',
  'charging',
] as const satisfies readonly CheckKey[];
type StepKey = (typeof flow)[number];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plataforma e tela, só para a loja saber o que testou. */
function deviceInfo(): DeviceInfo {
  const agent = navigator.userAgent;
  const ios = agent.match(/(iPhone|iPad).*OS (\d+)[_.](\d+)/);
  const android = agent.match(/Android (\d+(\.\d+)?)/);
  const platform = ios
    ? `${ios[1]}, iOS ${ios[2]}.${ios[3]}`
    : android
      ? `Android ${android[1]}`
      : navigator.platform || 'Navegador';
  const ratio = window.devicePixelRatio || 1;
  return {
    platform,
    screen: `${Math.round(screen.width * ratio)}×${Math.round(screen.height * ratio)}`,
  };
}

type BatteryLike = EventTarget & { level: number; charging: boolean };
const battery = () =>
  (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery?.();

export default function DeviceSelfTest({ token, test }: { token: string; test: PublicDeviceTest }) {
  const steps = flow.filter((key) => !test.answered.includes(key));
  const [index, setIndex] = useState(-1);
  const [outcomes, setOutcomes] = useState<Partial<Record<StepKey, Outcome>>>({});
  const [ended, setEnded] = useState(false);

  /** Manda um resultado; tenta de novo se a conexão falhar no meio. */
  const send = useCallback(
    async (body: object) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const response = await fetch('/api/public/device-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, ...body }),
            cache: 'no-store',
          });
          if (response.status === 404) return setEnded(true);
          if (response.ok || response.status === 400) return;
        } catch {
          // Sem conexão: espera um pouco e tenta de novo.
        }
        await sleep(1500 * (attempt + 1));
      }
    },
    [token],
  );

  const start = async () => {
    setIndex(0);
    const info = deviceInfo();
    const level = await battery()?.catch(() => undefined);
    if (level) info.battery = Math.round(level.level * 100);
    void send({ device: info });
  };

  const finish = (key: StepKey) => (outcome: Outcome) => {
    setOutcomes((current) => ({ ...current, [key]: outcome }));
    if (outcome.state !== 'skip')
      void send({
        results: [{ key, state: outcome.state, ...(outcome.note ? { note: outcome.note } : {}) }],
      });
    setIndex((current) => current + 1);
  };

  if (ended)
    return (
      <Centered title="Teste encerrado pela loja">
        A assistência encerrou este teste. Pode devolver o aparelho.
      </Centered>
    );

  if (index < 0)
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md grid-rows-[1fr_auto] gap-6 px-6 py-8">
        <div className="grid content-center gap-4">
          <p className="text-sm font-medium text-muted-foreground">{test.shop}</p>
          <h1 className="font-display text-[2rem] leading-tight font-bold tracking-tight">
            Vamos testar este aparelho
          </h1>
          <p className="text-muted-foreground">
            {test.order.device} · {test.order.code}. São {steps.length} testes rápidos, uns 2
            minutos. A loja vê cada resultado na hora.
          </p>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li>• Algumas etapas pedem permissão para câmera e microfone.</li>
            <li>• Nada é gravado nem enviado: só o resultado de cada teste.</li>
            <li>• Tire do silencioso e deixe o volume alto.</li>
          </ul>
        </div>
        <Button className="h-12 text-base" onClick={() => void start()} size="lg" type="button">
          Começar
        </Button>
      </main>
    );

  if (index >= steps.length)
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-6 py-8">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <Check aria-hidden="true" className="size-8" />
        </div>
        <div className="grid gap-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Teste concluído</h1>
          <p className="text-muted-foreground">
            Os resultados já estão na assistência. Pode devolver o aparelho.
          </p>
        </div>
        <ul className="grid gap-1 rounded-xl border bg-card p-2">
          {steps.map((key) => {
            const outcome = outcomes[key];
            return (
              <li key={key} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                <span>{checkDef(key)?.label}</span>
                <OutcomeTag outcome={outcome} />
              </li>
            );
          })}
        </ul>
      </main>
    );

  const key = steps[index];
  const Step = stepComponents[key];
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md grid-rows-[auto_1fr] gap-6 px-6 py-6">
      <header className="grid gap-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="truncate">{test.shop}</span>
          <span className="tabular-nums">
            {index + 1} de {steps.length}
          </span>
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {steps.map((step, position) => (
            <span
              key={step}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                position < index
                  ? outcomes[step]?.state === 'fail'
                    ? 'bg-rose-500'
                    : outcomes[step]?.state === 'ok'
                      ? 'bg-emerald-500'
                      : 'bg-muted-foreground/40'
                  : position === index
                    ? 'bg-foreground/40'
                    : 'bg-foreground/10',
              )}
            />
          ))}
        </div>
      </header>
      <Step key={key} done={finish(key)} />
    </main>
  );
}

function OutcomeTag({ outcome }: { outcome?: Outcome }) {
  if (!outcome) return null;
  const look = {
    ok: { icon: Check, label: 'Funciona', className: 'text-emerald-700 dark:text-emerald-300' },
    fail: { icon: X, label: 'Defeito', className: 'text-rose-700 dark:text-rose-300' },
    skip: { icon: Minus, label: 'Pulado', className: 'text-muted-foreground' },
  }[outcome.state];
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', look.className)}>
      <look.icon aria-hidden="true" className="size-4" />
      {look.label}
    </span>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-content-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
    </main>
  );
}

/** Moldura de cada etapa: o que fazer em cima, as respostas embaixo (na altura do polegar). */
function Shell({
  title,
  how,
  children,
  actions,
  skip,
}: {
  title: string;
  how: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  skip?: () => void;
}) {
  return (
    <section className="grid grid-rows-[auto_1fr_auto] gap-6">
      <div className="grid gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p aria-live="polite" className="text-muted-foreground">
          {how}
        </p>
      </div>
      <div className="grid place-items-center">{children}</div>
      <div className="grid gap-2">
        {actions}
        {skip && (
          <Button className="text-muted-foreground" onClick={skip} type="button" variant="ghost">
            Pular este teste
          </Button>
        )}
      </div>
    </section>
  );
}

function Answer({
  ok,
  fail,
  okLabel = 'Funciona',
  failLabel = 'Com defeito',
}: {
  ok: () => void;
  fail: () => void;
  okLabel?: string;
  failLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button className="h-12 text-base" onClick={fail} type="button" variant="outline">
        <X aria-hidden="true" />
        {failLabel}
      </Button>
      <Button className="h-12 text-base" onClick={ok} type="button">
        <Check aria-hidden="true" />
        {okLabel}
      </Button>
    </div>
  );
}

const permissionNote = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'sem permissão no navegador'
    : null;

/* ---------- Toque: a tela inteira em 60 áreas ---------- */

const COLS = 6;
const ROWS = 10;

function TouchStep({ done }: StepProps) {
  const [phase, setPhase] = useState<'intro' | 'drawing' | 'review'>('intro');
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  // Vários eventos chegam no mesmo quadro: a conta certa fica aqui, a tela usa o estado.
  const seen = useRef(new Set<number>());
  const total = COLS * ROWS;

  const stop = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setPhase('review');
  };

  const mark = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const col = Math.floor(((event.clientX - box.left) / box.width) * COLS);
    const row = Math.floor(((event.clientY - box.top) / box.height) * ROWS);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    const cell = row * COLS + col;
    if (seen.current.has(cell)) return;
    seen.current.add(cell);
    setTouched(new Set(seen.current));
    if (seen.current.size === total) {
      stop();
      done({ state: 'ok' });
    }
  };

  if (phase === 'drawing')
    return (
      <div
        className="fixed inset-0 z-50 grid touch-none bg-background select-none"
        onPointerDown={mark}
        onPointerMove={mark}
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: total }, (_, cell) => (
          <span
            key={cell}
            className={cn(
              'border border-foreground/5 transition-colors duration-150',
              touched.has(cell) ? 'bg-emerald-500/70' : 'bg-transparent',
            )}
          />
        ))}
        <div className="pointer-events-none fixed inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-foreground/80 px-3 py-1 text-sm font-medium text-background tabular-nums">
            {touched.size} de {total}
          </span>
        </div>
        <button
          className="fixed right-3 bottom-3 rounded-full bg-foreground/80 px-4 py-2 text-sm font-medium text-background"
          onClick={stop}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          Parar
        </button>
      </div>
    );

  const missing = total - touched.size;
  return (
    <Shell
      actions={
        phase === 'intro' ? (
          <Button
            className="h-12 text-base"
            onClick={() => {
              void document.documentElement.requestFullscreen?.().catch(() => {});
              seen.current = new Set();
              setTouched(new Set());
              setPhase('drawing');
            }}
            type="button"
          >
            Começar o toque
          </Button>
        ) : (
          <div className="grid gap-2">
            <Answer
              fail={() =>
                done({ state: 'fail', note: `sem resposta em ${missing} de ${total} áreas` })
              }
              failLabel="Áreas não respondem"
              ok={() => done({ state: 'ok' })}
              okLabel="Tudo respondeu"
            />
            <Button onClick={() => setPhase('intro')} type="button" variant="ghost">
              <RotateCcw aria-hidden="true" />
              Refazer
            </Button>
          </div>
        )
      }
      how={
        phase === 'intro'
          ? 'A tela vira uma grade. Passe o dedo por todos os quadrados, inclusive nos cantos: cada um acende ao ser tocado.'
          : `${touched.size} de ${total} áreas responderam. Alguma não acendeu mesmo passando o dedo?`
      }
      skip={() => done({ state: 'skip', note: 'pulado' })}
      title="Toque da tela"
    />
  );
}

/* ---------- Imagem: cores puras em tela cheia ---------- */

const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080'];

function DisplayStep({ done }: StepProps) {
  const [color, setColor] = useState(-1);
  if (color >= 0 && color < colors.length)
    return (
      <button
        aria-label="Próxima cor"
        className="fixed inset-0 z-50 cursor-pointer"
        onClick={() => setColor((value) => value + 1)}
        style={{ background: colors[color] }}
        type="button"
      >
        {color === 0 && (
          <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            Toque para trocar a cor
          </span>
        )}
      </button>
    );
  return color < 0 ? (
    <Shell
      actions={
        <Button
          className="h-12 text-base"
          onClick={() => {
            void document.documentElement.requestFullscreen?.().catch(() => {});
            setColor(0);
          }}
          type="button"
        >
          Mostrar as cores
        </Button>
      }
      how="A tela vai mostrar seis cores. Em cada uma, procure manchas, linhas, pontos apagados ou partes mais escuras."
      skip={() => done({ state: 'skip', note: 'pulado' })}
      title="Imagem da tela"
    />
  ) : (
    <Shell
      actions={
        <Answer
          fail={() => done({ state: 'fail', note: 'manchas, linhas ou pontos na imagem' })}
          failLabel="Vi defeito"
          ok={() => {
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            done({ state: 'ok' });
          }}
          okLabel="Perfeita"
        />
      }
      how="Viu alguma mancha, linha ou ponto diferente em alguma das cores?"
      title="Imagem da tela"
    />
  );
}

/* ---------- Alto-falante: quantos bipes você ouviu? ---------- */

async function beeps(count: number) {
  const context = new AudioContext();
  await context.resume();
  for (let i = 0; i < count; i++) {
    const at = context.currentTime + 0.15 + i * 0.5;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.9, at + 0.02);
    gain.gain.linearRampToValueAtTime(0, at + 0.25);
    tone.connect(gain).connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.3);
  }
  await sleep(count * 500 + 400);
  await context.close();
}

function SpeakerStep({ done }: StepProps) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'answer'>('ready');
  const [count, setCount] = useState(0);
  const [tries, setTries] = useState(0);

  const play = async () => {
    const next = (crypto.getRandomValues(new Uint8Array(1))[0] % 3) + 1;
    setCount(next);
    setPhase('playing');
    try {
      await beeps(next);
      setPhase('answer');
    } catch {
      done({ state: 'skip', note: 'o navegador não tocou o som' });
    }
  };

  const pick = (heard: number) => {
    if (heard === count) return done({ state: 'ok' });
    if (heard === 0) return done({ state: 'fail', note: 'sem som no alto-falante' });
    if (tries === 0) {
      setTries(1);
      setPhase('ready');
      return;
    }
    done({ state: 'fail', note: 'som falhando ou muito baixo' });
  };

  return (
    <Shell
      actions={
        phase === 'answer' ? (
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3].map((value) => (
              <Button
                key={value}
                className="h-12 text-lg"
                onClick={() => pick(value)}
                type="button"
                variant="outline"
              >
                {value}
              </Button>
            ))}
            <Button className="h-12" onClick={() => pick(0)} type="button" variant="outline">
              Nada
            </Button>
          </div>
        ) : (
          <Button
            className="h-12 text-base"
            disabled={phase === 'playing'}
            onClick={() => void play()}
            type="button"
          >
            {phase === 'playing' ? 'Tocando…' : tries ? 'Tocar de novo' : 'Tocar os bipes'}
          </Button>
        )
      }
      how={
        phase === 'answer'
          ? 'Quantos bipes você ouviu?'
          : tries
            ? 'Não bateu. Vamos tocar outra sequência: preste atenção.'
            : 'O aparelho vai tocar de um a três bipes. Depois, diga quantos ouviu.'
      }
      skip={() => done({ state: 'skip', note: 'pulado' })}
      title="Alto-falante"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-36 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 transition-transform dark:text-sky-300',
          phase === 'playing' && 'scale-110 animate-pulse',
        )}
      >
        <Volume2 className="size-16" />
      </span>
    </Shell>
  );
}

/* ---------- Microfone: medidor de volume ao vivo ---------- */

function MicrophoneStep({ done }: StepProps) {
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<'ready' | 'listening' | 'heard'>('ready');
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  const listen = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let loud = 0;
      let frame = 0;
      stop.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((track) => track.stop());
        void context.close().catch(() => {});
      };
      setStatus('listening');
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
        );
        setLevel(Math.min(1, rms * 9));
        loud = rms > 0.05 ? loud + 1 : loud;
        if (loud > 15) {
          stop.current();
          setStatus('heard');
          setTimeout(() => done({ state: 'ok' }), 700);
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      const denied = permissionNote(error);
      done(
        denied ? { state: 'skip', note: denied } : { state: 'fail', note: 'microfone não abriu' },
      );
    }
  };

  return (
    <Shell
      actions={
        status === 'ready' ? (
          <Button className="h-12 text-base" onClick={() => void listen()} type="button">
            Ouvir o microfone
          </Button>
        ) : (
          <Button
            className="h-12 text-base"
            onClick={() => {
              stop.current();
              done({ state: 'fail', note: 'o microfone não captou som' });
            }}
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Não capta nada
          </Button>
        )
      }
      how={
        status === 'heard'
          ? 'Ouvimos você. O microfone funciona.'
          : status === 'listening'
            ? 'Fale alguma coisa perto do aparelho. A barra sobe com a sua voz.'
            : 'Vamos ouvir o microfone por alguns segundos. Nada é gravado.'
      }
      skip={() => {
        stop.current();
        done({ state: 'skip', note: 'pulado' });
      }}
      title="Microfone"
    >
      <div className="flex h-40 items-end gap-1.5" aria-hidden="true">
        {Array.from({ length: 12 }, (_, bar) => {
          const lit = level * 12 > bar;
          return (
            <span
              key={bar}
              className={cn(
                'w-4 rounded-full transition-[height,background-color] duration-75',
                lit ? (status === 'heard' ? 'bg-emerald-500' : 'bg-sky-500') : 'bg-foreground/10',
              )}
              style={{ height: `${20 + bar * 10}%` }}
            />
          );
        })}
      </div>
    </Shell>
  );
}

/* ---------- Câmeras e lanterna ---------- */

/** Abre a câmera e mostra ao vivo no <video> que receber `attach`. */
function useCamera(facing: 'environment' | 'user') {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const attach = useCallback(
    (node: HTMLVideoElement | null) => {
      if (!node || !stream) return;
      node.srcObject = stream;
      void node.play().catch(() => {});
    },
    [stream],
  );
  // A câmera desliga ao trocar de etapa (ou de stream).
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  const open = async (): Promise<{ stream: MediaStream } | { error: unknown }> => {
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      setStream(opened);
      return { stream: opened };
    } catch (error) {
      return { error };
    }
  };
  const close = () => stream?.getTracks().forEach((track) => track.stop());
  return { attach, live: Boolean(stream), open, close };
}

const cameraFailure = (error: unknown): Outcome => {
  const denied = permissionNote(error);
  return denied ? { state: 'skip', note: denied } : { state: 'fail', note: 'a câmera não abriu' };
};

function CameraStep({ done, facing }: StepProps & { facing: 'environment' | 'user' }) {
  const { attach, live, open, close } = useCamera(facing);
  const front = facing === 'user';
  const finish = (outcome: Outcome) => {
    close();
    done(outcome);
  };
  const start = async () => {
    const opened = await open();
    if ('error' in opened) done(cameraFailure(opened.error));
  };
  return (
    <Shell
      actions={
        live ? (
          <Answer
            fail={() => finish({ state: 'fail', note: 'imagem com defeito' })}
            failLabel="Com defeito"
            ok={() => finish({ state: 'ok' })}
            okLabel="Nítida"
          />
        ) : (
          <Button className="h-12 text-base" onClick={() => void start()} type="button">
            Abrir a câmera {front ? 'frontal' : 'traseira'}
          </Button>
        )
      }
      how={
        live
          ? front
            ? 'A imagem do seu rosto aparece nítida, sem manchas?'
            : 'Aponte para algo perto e algo longe. A imagem foca e aparece nítida, sem manchas?'
          : 'A imagem aparece só aqui, ao vivo. Nada é gravado.'
      }
      skip={() => finish({ state: 'skip', note: 'pulado' })}
      title={front ? 'Câmera frontal' : 'Câmera traseira'}
    >
      <video
        ref={attach}
        aria-label="Imagem da câmera ao vivo"
        className={cn(
          'aspect-[3/4] w-full max-w-xs rounded-2xl bg-foreground/10 object-cover',
          front && '-scale-x-100',
          !live && 'opacity-40',
        )}
        muted
        playsInline
      />
    </Shell>
  );
}

function FlashStep({ done }: StepProps) {
  const camera = useCamera('environment');
  const [phase, setPhase] = useState<'ready' | 'on' | 'unsupported'>('ready');
  const finish = (outcome: Outcome) => {
    camera.close();
    done(outcome);
  };
  const light = async () => {
    const opened = await camera.open();
    if ('error' in opened) return done(cameraFailure(opened.error));
    const track = opened.stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as
      (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    try {
      if (!track || !capabilities?.torch) throw new Error('torch');
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      setPhase('on');
    } catch {
      opened.stream.getTracks().forEach((item) => item.stop());
      setPhase('unsupported');
    }
  };
  return (
    <Shell
      actions={
        phase === 'on' ? (
          <Answer
            fail={() => finish({ state: 'fail', note: 'a lanterna não acendeu' })}
            failLabel="Não acendeu"
            ok={() => finish({ state: 'ok' })}
            okLabel="Acendeu"
          />
        ) : phase === 'unsupported' ? (
          <Button
            className="h-12 text-base"
            onClick={() => finish({ state: 'skip', note: 'o navegador não liga a lanterna' })}
            type="button"
          >
            Seguir
          </Button>
        ) : (
          <Button className="h-12 text-base" onClick={() => void light()} type="button">
            Ligar a lanterna
          </Button>
        )
      }
      how={
        phase === 'on'
          ? 'A lanterna atrás do aparelho acendeu?'
          : phase === 'unsupported'
            ? 'Este navegador não consegue ligar a lanterna. A loja confere à mão.'
            : 'Vamos acender a lanterna pela câmera traseira.'
      }
      skip={() => finish({ state: 'skip', note: 'pulado' })}
      title="Lanterna"
    />
  );
}

/* ---------- Vibração ---------- */

function VibrationStep({ done }: StepProps) {
  const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const [tried, setTried] = useState(false);
  if (!supported)
    return (
      <Shell
        actions={
          <Button
            className="h-12 text-base"
            onClick={() => done({ state: 'skip', note: 'o navegador não vibra o aparelho' })}
            type="button"
          >
            Seguir
          </Button>
        }
        how="Este aparelho não deixa o navegador vibrar. A loja confere à mão."
        title="Vibração"
      />
    );
  return (
    <Shell
      actions={
        tried ? (
          <Answer
            fail={() => done({ state: 'fail', note: 'não vibrou' })}
            failLabel="Não vibrou"
            ok={() => done({ state: 'ok' })}
            okLabel="Vibrou"
          />
        ) : (
          <Button
            className="h-12 text-base"
            onClick={() => {
              navigator.vibrate([400, 150, 400]);
              setTried(true);
            }}
            type="button"
          >
            Vibrar
          </Button>
        )
      }
      how={tried ? 'Sentiu o aparelho vibrar duas vezes?' : 'Segure o aparelho e toque em Vibrar.'}
      skip={() => done({ state: 'skip', note: 'pulado' })}
      title="Vibração"
    />
  );
}

/* ---------- Giroscópio: um nível de bolha ---------- */

function MotionStep({ done }: StepProps) {
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<'ready' | 'moving' | 'silent'>('ready');
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  const begin = async () => {
    const Orientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof Orientation.requestPermission === 'function') {
      const answer = await Orientation.requestPermission().catch(() => 'denied');
      if (answer !== 'granted') return done({ state: 'skip', note: 'sem permissão no navegador' });
    }
    const range = { beta: [Infinity, -Infinity], gamma: [Infinity, -Infinity] };
    const onTurn = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      setPhase((current) => (current === 'silent' ? 'moving' : current));
      range.beta = [Math.min(range.beta[0], event.beta), Math.max(range.beta[1], event.beta)];
      range.gamma = [Math.min(range.gamma[0], event.gamma), Math.max(range.gamma[1], event.gamma)];
      setTilt({
        x: Math.max(-1, Math.min(1, event.gamma / 45)),
        y: Math.max(-1, Math.min(1, (event.beta - 45) / 45)),
      });
      if (range.beta[1] - range.beta[0] > 35 || range.gamma[1] - range.gamma[0] > 35) {
        stop.current();
        setTimeout(() => done({ state: 'ok' }), 500);
      }
    };
    window.addEventListener('deviceorientation', onTurn);
    const silence = setTimeout(
      () => setPhase((current) => (current === 'moving' ? 'silent' : current)),
      5000,
    );
    stop.current = () => {
      window.removeEventListener('deviceorientation', onTurn);
      clearTimeout(silence);
    };
    setPhase('moving');
  };

  return (
    <Shell
      actions={
        phase === 'ready' ? (
          <Button className="h-12 text-base" onClick={() => void begin()} type="button">
            Começar
          </Button>
        ) : phase === 'silent' && !tilt ? (
          <Answer
            fail={() => {
              stop.current();
              done({ state: 'fail', note: 'o sensor não respondeu' });
            }}
            failLabel="Não respondeu"
            ok={() => {
              stop.current();
              done({ state: 'skip', note: 'sensor sem leitura no navegador' });
            }}
            okLabel="Pular"
          />
        ) : undefined
      }
      how={
        phase === 'ready'
          ? 'Vamos ver se o aparelho percebe quando é inclinado.'
          : phase === 'silent' && !tilt
            ? 'O sensor não mandou nenhuma leitura.'
            : 'Incline o aparelho para os lados e para a frente: leve a bolha até as bordas.'
      }
      skip={() => {
        stop.current();
        done({ state: 'skip', note: 'pulado' });
      }}
      title="Giroscópio"
    >
      <div
        aria-hidden="true"
        className="relative size-48 rounded-full border-2 border-foreground/15 bg-card"
      >
        <span className="absolute top-1/2 left-1/2 size-12 -translate-1/2 rounded-full border border-dashed border-foreground/20" />
        <span
          className="absolute top-1/2 left-1/2 size-10 rounded-full bg-sky-500/80 shadow-lg transition-transform duration-100"
          style={{
            transform: `translate(calc(-50% + ${(tilt?.x ?? 0) * 70}px), calc(-50% + ${(tilt?.y ?? 0) * 70}px))`,
          }}
        />
      </div>
    </Shell>
  );
}

/* ---------- Carregamento ---------- */

function ChargingStep({ done }: StepProps) {
  const supported = typeof navigator !== 'undefined' && 'getBattery' in navigator;
  const [phase, setPhase] = useState<'checking' | 'waiting' | 'unsupported'>(
    supported ? 'checking' : 'unsupported',
  );
  const [level, setLevel] = useState<number>();
  const stop = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    const manager = battery();
    if (!manager) return;
    manager
      .then((status) => {
        if (!active) return;
        setLevel(Math.round(status.level * 100));
        if (status.charging) return done({ state: 'ok', note: 'já estava carregando' });
        const onChange = () => {
          if (!status.charging) return;
          stop.current();
          done({ state: 'ok' });
        };
        status.addEventListener('chargingchange', onChange);
        stop.current = () => status.removeEventListener('chargingchange', onChange);
        setPhase('waiting');
      })
      .catch(() => active && setPhase('unsupported'));
    return () => {
      active = false;
      stop.current();
    };
    // Roda uma vez, ao abrir a etapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Shell
      actions={
        phase === 'waiting' ? (
          <Button
            className="h-12 text-base"
            onClick={() => {
              stop.current();
              done({ state: 'fail', note: 'não reconheceu o carregador' });
            }}
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            Não carrega
          </Button>
        ) : phase === 'unsupported' ? (
          <Button
            className="h-12 text-base"
            onClick={() => done({ state: 'skip', note: 'o navegador não informa a bateria' })}
            type="button"
          >
            Seguir
          </Button>
        ) : undefined
      }
      how={
        phase === 'unsupported'
          ? 'Este navegador não informa a bateria. A loja confere o carregamento à mão.'
          : 'Ligue o carregador no aparelho. Quando ele começar a carregar, o teste segue sozinho.'
      }
      skip={
        phase === 'waiting'
          ? () => {
              stop.current();
              done({ state: 'skip', note: 'pulado' });
            }
          : undefined
      }
      title="Carregamento"
    >
      {level !== undefined && (
        <div aria-hidden="true" className="grid justify-items-center gap-2">
          <div className="relative h-24 w-14 rounded-xl border-2 border-foreground/30 p-1.5">
            <span className="absolute -top-2 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-t bg-foreground/30" />
            <span
              className="absolute inset-x-1.5 bottom-1.5 animate-pulse rounded-md bg-emerald-500"
              style={{ height: `calc(${level}% - 0.75rem)` }}
            />
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">{level}%</span>
        </div>
      )}
    </Shell>
  );
}

const stepComponents: Record<StepKey, (props: StepProps) => React.ReactNode> = {
  touch: TouchStep,
  display: DisplayStep,
  speaker: SpeakerStep,
  microphone: MicrophoneStep,
  'rear-camera': (props) => <CameraStep {...props} facing="environment" />,
  'front-camera': (props) => <CameraStep {...props} facing="user" />,
  flash: FlashStep,
  vibration: VibrationStep,
  motion: MotionStep,
  charging: ChargingStep,
};
