import { cn } from 'cn';
import { toneDot } from '@/components/ui/tone';
import { normalizeOrderStage, orderStages } from '@/lib/order-stages';
import { orderStageTone } from '@/lib/status-tones';

/**
 * O trilho da OS: o caminho do aparelho pela bancada (Recebido → Aguardando
 * peça → Em serviço → Retirada → Concluído) desenhado em cinco segmentos. Os
 * segmentos até a etapa atual ficam na cor dela; é a mesma figura na lista,
 * na mesa, na OS aberta e no início.
 */

/** Posição da etapa no trilho, de 1 a 5. */
export const stagePosition = (stage: string | undefined) =>
  orderStages.indexOf(normalizeOrderStage(stage)) + 1;

/** Cor dos segmentos preenchidos: a do tom da etapa (recebido fica na tinta). */
export function stageFill(stage: string | undefined) {
  const tone = orderStageTone(normalizeOrderStage(stage));
  return tone === 'neutral' ? 'bg-muted-foreground' : toneDot[tone];
}

export const emptySegment = 'bg-foreground/12';

/** Versão compacta, ao lado do nome da etapa (lista, mesa). Decorativa. */
export function StageTrack({ stage, className }: { stage?: string; className?: string }) {
  const position = stagePosition(stage);
  const fill = stageFill(stage);
  return (
    <span
      aria-hidden="true"
      data-stage-track={position}
      className={cn('inline-flex shrink-0 items-center gap-[2px]', className)}
    >
      {orderStages.map((item, index) => (
        <span
          key={item}
          className={cn('h-3 w-[3px] rounded-full', index < position ? fill : emptySegment)}
        />
      ))}
    </span>
  );
}

/** Versão com os nomes das etapas, para a OS aberta. */
export function StageSteps({ stage, className }: { stage?: string; className?: string }) {
  const position = stagePosition(stage);
  const fill = stageFill(stage);
  return (
    <ol aria-label="Etapas da OS" className={cn('grid grid-cols-5 gap-1.5', className)}>
      {orderStages.map((item, index) => {
        const current = index + 1 === position;
        return (
          <li key={item} aria-current={current ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn('block h-1.5 rounded-full', index < position ? fill : emptySegment)}
            />
            <span
              className={cn(
                'mt-1.5 block text-xs leading-tight',
                current
                  ? 'font-semibold text-foreground'
                  : index < position
                    ? 'text-foreground/75'
                    : 'text-muted-foreground',
              )}
            >
              {item}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
