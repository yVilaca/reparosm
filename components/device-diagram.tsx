'use client';

import { cn } from 'cn';
import {
  checkDef,
  damageLabel,
  type CheckKey,
  type CheckState,
  type DamageKind,
  type DamageMark,
} from '@/lib/order-checklist';

export type Side = 'front' | 'back';

/** Corpo do aparelho no desenho (viewBox 0 0 240 460). */
const BODY = { x: 30, y: 10, width: 180, height: 440 };

/** Onde cada teste fica no aparelho. Os que não têm lugar aparecem como "por dentro". */
export const spots: Partial<Record<CheckKey, { side: Side; x: number; y: number }[]>> = {
  touch: [{ side: 'front', x: 120, y: 170 }],
  display: [{ side: 'front', x: 120, y: 290 }],
  'front-camera': [{ side: 'front', x: 120, y: 40 }],
  earpiece: [{ side: 'front', x: 120, y: 17 }],
  proximity: [{ side: 'front', x: 152, y: 40 }],
  biometrics: [{ side: 'front', x: 120, y: 392 }],
  microphone: [{ side: 'front', x: 88, y: 446 }],
  charging: [{ side: 'front', x: 120, y: 446 }],
  speaker: [{ side: 'front', x: 152, y: 446 }],
  buttons: [
    { side: 'front', x: 30, y: 152 },
    { side: 'front', x: 210, y: 160 },
    { side: 'back', x: 210, y: 152 },
    { side: 'back', x: 30, y: 160 },
  ],
  signal: [
    { side: 'front', x: 30, y: 292 },
    { side: 'back', x: 210, y: 292 },
  ],
  'rear-camera': [{ side: 'back', x: 74, y: 64 }],
  flash: [{ side: 'back', x: 104, y: 38 }],
  battery: [{ side: 'back', x: 120, y: 262 }],
};

export const insideKeys = (['motion', 'vibration', 'wifi', 'bluetooth'] as const).filter(
  (key) => !spots[key],
);

/** Lado em que o teste aparece primeiro (para virar o desenho até ele). */
export const sideOf = (key: CheckKey): Side | undefined => spots[key]?.[0]?.side;

/** Cor de fundo de cada resposta (segmentos e pontos fora do desenho). */
export const stateBg: Record<CheckState | 'none', string> = {
  ok: 'bg-emerald-500',
  fail: 'bg-rose-500',
  skip: 'bg-muted-foreground/40',
  none: 'bg-foreground/10',
};

export const stateFill: Record<CheckState | 'none', string> = {
  ok: 'fill-emerald-500',
  fail: 'fill-rose-500',
  skip: 'fill-muted-foreground/45',
  none: 'fill-background',
};

function Mark({ mark, selected }: { mark: DamageMark; selected: boolean }) {
  const cx = BODY.x + mark.x * BODY.width;
  const cy = BODY.y + mark.y * BODY.height;
  const shape: Record<DamageKind, React.ReactNode> = {
    crack: <path d="M-7 -8 L-1 -2 L-5 1 L2 8 M-1 -2 L5 -6" />,
    scratch: <path d="M-8 6 L8 -6 M-5 8 L6 0" />,
    dent: <circle r="6" />,
    other: <circle r="2.5" className="fill-current" />,
  };
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      className="pointer-events-none text-rose-600 dark:text-rose-400"
    >
      <circle
        r="12"
        className={cn('fill-rose-500/15', selected && 'stroke-current [stroke-width:1.5]')}
      />
      <g className="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
        {shape[mark.kind]}
      </g>
      <title>{`${damageLabel(mark.kind)}${mark.note ? `: ${mark.note}` : ''}`}</title>
    </g>
  );
}

function Face({
  side,
  states,
  focus,
  pulse,
  marks,
  selectedMark,
  marking,
  disabled,
  onSpot,
  onPlace,
}: DiagramProps & { side: Side }) {
  const screenState = (['touch', 'display'] as const).map((key) => states[key]);
  const screenTone = screenState.includes('fail')
    ? 'fill-rose-500/10'
    : screenState.every((state) => state === 'ok')
      ? 'fill-emerald-500/10'
      : 'fill-muted';

  const place = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!marking) return;
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
    const x = (local.x - BODY.x) / BODY.width;
    const y = (local.y - BODY.y) / BODY.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    // Coordenadas de quem olha aquele lado de frente.
    onPlace?.(side, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  };

  return (
    <svg
      viewBox="0 0 240 460"
      className={cn('h-full w-full overflow-visible', marking && 'cursor-crosshair')}
      onClick={place}
      aria-hidden="true"
    >
      {/* Botões laterais: volume à esquerda na frente, à direita no verso. */}
      <g className="fill-foreground/20">
        <rect x={side === 'front' ? 26 : 209} y="112" width="5" height="34" rx="2" />
        <rect x={side === 'front' ? 26 : 209} y="152" width="5" height="34" rx="2" />
        <rect x={side === 'front' ? 209 : 26} y="134" width="5" height="52" rx="2" />
      </g>
      <rect {...BODY} rx="34" className="fill-card stroke-foreground/25 [stroke-width:2]" />
      {side === 'front' ? (
        <>
          <rect
            x="40"
            y="22"
            width="160"
            height="416"
            rx="26"
            className={cn(screenTone, 'transition-colors duration-500')}
          />
          <rect x="98" y="33" width="44" height="14" rx="7" className="fill-foreground/80" />
          <rect x="105" y="13.5" width="30" height="2.5" rx="1.25" className="fill-foreground/25" />
          <g className="fill-foreground/30">
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={146 + i * 4} cy="446" r="1.2" />
            ))}
            <rect x="110" y="443.5" width="20" height="5" rx="2.5" />
            <circle cx="88" cy="446" r="1.3" />
          </g>
        </>
      ) : (
        <>
          <rect
            x="44"
            y="24"
            width="80"
            height="82"
            rx="20"
            className="fill-muted stroke-foreground/15"
          />
          <circle cx="66" cy="46" r="13" className="fill-foreground/75" />
          <circle cx="66" cy="84" r="13" className="fill-foreground/75" />
          <circle cx="102" cy="65" r="11" className="fill-foreground/60" />
          <circle cx="104" cy="38" r="4" className="fill-amber-200/80" />
          {/* A bateria, como num raio X. */}
          <rect
            x="62"
            y="160"
            width="116"
            height="210"
            rx="14"
            className="fill-none stroke-foreground/12 [stroke-dasharray:5_5] [stroke-width:1.5]"
          />
        </>
      )}

      {marks
        .filter((mark) => mark.side === side)
        .map((mark) => (
          <Mark key={mark.id} mark={mark} selected={mark.id === selectedMark} />
        ))}

      {Object.entries(spots).flatMap(([key, places]) =>
        places!
          .filter((place) => place.side === side)
          .map((place, index) => {
            const state = states[key as CheckKey];
            const active = focus === key;
            return (
              <g
                key={`${key}-${index}`}
                transform={`translate(${place.x} ${place.y})`}
                className={cn(
                  'outline-none',
                  marking || disabled ? 'pointer-events-none' : 'cursor-pointer',
                  disabled && 'opacity-30',
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onSpot?.(key as CheckKey);
                }}
              >
                <title>{checkDef(key)?.label}</title>
                {pulse.includes(key as CheckKey) && (
                  <circle
                    r="9"
                    className="animate-ping fill-emerald-500/60 [transform-box:fill-box] [transform-origin:center]"
                  />
                )}
                {active && (
                  <circle r="15" className="fill-none stroke-foreground/70 [stroke-width:2]" />
                )}
                <circle r="12" className="fill-transparent" />
                <circle
                  r="7.5"
                  className={cn(
                    stateFill[state ?? 'none'],
                    'stroke-background [stroke-width:2.5] transition-colors duration-300',
                    !state &&
                      'stroke-muted-foreground/70 [stroke-dasharray:3_2] [stroke-width:1.5]',
                  )}
                />
              </g>
            );
          }),
      )}
    </svg>
  );
}

type DiagramProps = {
  states: Partial<Record<CheckKey, CheckState>>;
  focus?: CheckKey;
  /** Testes que acabaram de chegar do aparelho (acendem por um instante). */
  pulse: CheckKey[];
  marks: DamageMark[];
  selectedMark?: string;
  marking: boolean;
  /** "Não liga": os pontos de teste apagam. */
  disabled?: boolean;
  onSpot?: (key: CheckKey) => void;
  onPlace?: (side: Side, x: number, y: number) => void;
};

/** O aparelho desenhado, frente e verso. Vira em 3D quando o lado muda. */
export default function DeviceDiagram({
  side,
  className,
  ...props
}: DiagramProps & { side: Side; className?: string }) {
  return (
    <div className={cn('relative mx-auto aspect-[240/460] [perspective:1400px]', className)}>
      <div
        className={cn(
          'absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] [transform-style:preserve-3d] motion-reduce:transition-none',
          side === 'back' && '[transform:rotateY(180deg)]',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 [backface-visibility:hidden]',
            side !== 'front' && 'pointer-events-none',
          )}
          inert={side !== 'front'}
        >
          <Face side="front" {...props} />
        </div>
        <div
          className={cn(
            'absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]',
            side !== 'back' && 'pointer-events-none',
          )}
          inert={side !== 'back'}
        >
          <Face side="back" {...props} />
        </div>
      </div>
    </div>
  );
}
