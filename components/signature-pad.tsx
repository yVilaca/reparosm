'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { cn } from 'cn';

/** Ponto do traço, em fração da área (x, y) e da altura (w): sobrevive a girar a tela. */
type Point = { x: number; y: number; w: number };
type Stroke = Point[];

export type SignaturePadHandle = {
  clear: () => void;
  undo: () => void;
  /** PNG recortado no traço, em alta resolução; null sem assinatura de verdade. */
  toPng: () => string | null;
};

/** Tinta de caneta azul: reconhecível como assinatura e boa na impressão. */
const INK = '#1d3a8a';
/** Traço mínimo (em alturas da área) para valer como assinatura, não um toque. */
const MIN_INK = 0.9;

const length = (strokes: Stroke[], width: number, height: number) =>
  strokes.reduce(
    (sum, stroke) =>
      sum +
      stroke.reduce((part, point, index) => {
        if (!index) return part;
        const before = stroke[index - 1];
        return part + Math.hypot((point.x - before.x) * width, (point.y - before.y) * height);
      }, 0),
    0,
  );

/** Desenha os traços com curvas pelos pontos médios e espessura que acompanha o traço. */
function paint(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  offset = { x: 0, y: 0 },
) {
  context.fillStyle = INK;
  context.strokeStyle = INK;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const at = (point: Point) => ({
    x: point.x * width - offset.x,
    y: point.y * height - offset.y,
    w: point.w * height,
  });
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const dot = at(stroke[0]);
      context.beginPath();
      context.arc(dot.x, dot.y, dot.w / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    for (let index = 1; index < stroke.length; index++) {
      const before = at(stroke[index - 1]);
      const point = at(stroke[index]);
      const previous = index > 1 ? at(stroke[index - 2]) : before;
      context.beginPath();
      context.lineWidth = (before.w + point.w) / 2;
      context.moveTo((previous.x + before.x) / 2, (previous.y + before.y) / 2);
      context.quadraticCurveTo(
        before.x,
        before.y,
        (before.x + point.x) / 2,
        (before.y + point.y) / 2,
      );
      context.stroke();
    }
  }
}

/**
 * Área para assinar com dedo, mouse ou caneta. Com caneta, o traço acompanha a
 * pressão e o toque da mão apoiada é ignorado. Avisa quando passa a ter (ou deixa
 * de ter) uma assinatura de verdade.
 */
export default function SignaturePad({
  ref,
  onInkChange,
  label,
  className,
}: {
  ref?: Ref<SignaturePadHandle>;
  onInkChange?: (hasInk: boolean) => void;
  /** Nome acessível da área (ex.: "Assinatura do cliente"). */
  label: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<{ id: number; time: number; last?: Point } | null>(null);
  const penSeen = useRef(false);
  const inked = useRef(false);

  const size = () => {
    const element = canvas.current;
    return element ? { width: element.clientWidth, height: element.clientHeight } : null;
  };

  const redraw = useCallback(() => {
    const element = canvas.current;
    const box = size();
    const context = element?.getContext('2d');
    if (!element || !box || !context) return;
    const ratio = window.devicePixelRatio || 1;
    if (element.width !== Math.round(box.width * ratio))
      element.width = Math.round(box.width * ratio);
    if (element.height !== Math.round(box.height * ratio))
      element.height = Math.round(box.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, box.width, box.height);
    paint(context, strokes.current, box.width, box.height);
  }, []);

  const report = useCallback(() => {
    const box = size();
    const hasInk = Boolean(
      box && length(strokes.current, box.width, box.height) >= MIN_INK * box.height,
    );
    if (hasInk !== inked.current) {
      inked.current = hasInk;
      onInkChange?.(hasInk);
    }
  }, [onInkChange]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    redraw();
    const observer = new ResizeObserver(() => redraw());
    observer.observe(element);
    return () => observer.disconnect();
  }, [redraw]);

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        strokes.current = [];
        redraw();
        report();
      },
      undo() {
        strokes.current = strokes.current.slice(0, -1);
        redraw();
        report();
      },
      toPng() {
        const box = size();
        if (!box || !inked.current) return null;
        const points = strokes.current.flat();
        const pad = Math.max(...points.map((point) => point.w)) * box.height;
        const left = Math.min(...points.map((point) => point.x)) * box.width - pad;
        const top = Math.min(...points.map((point) => point.y)) * box.height - pad;
        const right = Math.max(...points.map((point) => point.x)) * box.width + pad;
        const bottom = Math.max(...points.map((point) => point.y)) * box.height + pad;
        // Alta resolução para a impressão, sem passar de 1600 px de largura.
        const scale = Math.min(3, 1600 / Math.max(1, right - left));
        const output = document.createElement('canvas');
        output.width = Math.ceil((right - left) * scale);
        output.height = Math.ceil((bottom - top) * scale);
        const context = output.getContext('2d');
        if (!context) return null;
        context.scale(scale, scale);
        paint(context, strokes.current, box.width, box.height, { x: left, y: top });
        return output.toDataURL('image/png');
      },
    }),
    [redraw, report],
  );

  const pointFrom = (event: PointerEvent | ReactPointerEvent, previous?: Point, elapsed = 16) => {
    const element = canvas.current!;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const base = 0.012;
    let w: number;
    if (event.pointerType === 'pen' && event.pressure > 0) w = base * (0.45 + event.pressure * 1.1);
    else {
      // Dedo e mouse: mais rápido, mais fino, como numa caneta de verdade.
      const speed = previous
        ? Math.hypot((x - previous.x) * rect.width, (y - previous.y) * rect.height) /
          Math.max(1, elapsed)
        : 0;
      const target = Math.min(base * 1.5, Math.max(base * 0.55, base * (1.5 - speed * 0.45)));
      w = previous ? previous.w * 0.6 + target * 0.4 : target;
    }
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), w };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'pen') penSeen.current = true;
    // Com caneta em uso, a mão apoiada na tela não risca.
    if (event.pointerType === 'touch' && penSeen.current) return;
    if (event.button > 0 || active.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    strokes.current = [...strokes.current, [point]];
    active.current = { id: event.pointerId, time: event.timeStamp, last: point };
    redraw();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = active.current;
    if (!current || current.id !== event.pointerId) return;
    event.preventDefault();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const stroke = strokes.current[strokes.current.length - 1];
    for (const item of events.length ? events : [event.nativeEvent]) {
      const point = pointFrom(item, current.last, item.timeStamp - current.time);
      stroke.push(point);
      current.last = point;
      current.time = item.timeStamp;
    }
    redraw();
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!active.current || active.current.id !== event.pointerId) return;
    active.current = null;
    report();
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-white ring-1 ring-foreground/15 dark:ring-white/20',
        className,
      )}
    >
      {/* Linha de assinatura, como no papel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-6 bottom-[22%] left-6 flex items-end gap-2 border-b border-slate-300 pb-1 text-lg leading-none text-slate-400"
      >
        ×
      </div>
      <canvas
        aria-label={label}
        className="relative block size-full cursor-crosshair touch-none select-none"
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        ref={canvas}
        role="img"
      />
    </div>
  );
}
