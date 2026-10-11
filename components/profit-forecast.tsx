import Link from 'next/link';
import { CalendarDays, Gauge, Info, TrendingUp, Wallet } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui/empty-state';
import IconChip from '@/components/ui/icon-chip';
import StatCard, { StatGroup } from '@/components/ui/stat-card';
import { toneSurface, toneText, type Tone } from '@/components/ui/tone';
import { PROFIT_FORECAST_PATH } from '@/lib/finance-paths';
import type { ForecastPoint, MonthForecast } from '@/lib/forecast';
import { formatMoney } from '@/lib/format';

const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const axisMoney = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const isEmpty = (forecast: MonthForecast) =>
  forecast.confidence === 'none' && !forecast.realized.income && !forecast.bills;

/** Explicação do cálculo: a mesma que vai para quem pediu a funcionalidade. */
export const forecastExplanation =
  'A previsão soma o que já entrou e saiu no caixa neste mês com o que a loja costuma fazer nos dias que faltam. As vendas seguem a média de cada dia da semana nas últimas 8 semanas, já sem o custo das peças; os gastos avulsos seguem a média por dia, sem os dias fora do comum (como a compra de um equipamento). As contas a pagar que vencem até o fim do mês, inclusive recorrentes e atrasadas, entram pelo valor exato, e uma conta paga adiantada conta no mês em que vence; compras de peças não contam como gasto, porque o custo já sai de cada OS. O mínimo considera só o que já aconteceu e as OS prontas, sem vendas novas, e os cenários usam o ritmo das 2 semanas mais fracas e das 2 mais fortes. Com menos de 3 semanas de movimento, a estimativa aparece como fraca.';

function Line({
  label,
  hint,
  value,
  sign,
  strong = false,
}: {
  label: string;
  hint?: string;
  value: number;
  sign: '+' | '−' | '';
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        strong && 'mt-1 border-t pt-2 font-semibold',
      )}
    >
      <dt className={strong ? '' : 'text-muted-foreground'}>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </dt>
      <dd
        className={cn(
          'shrink-0 tabular-nums',
          sign === '−' && value !== 0 && 'text-rose-700 dark:text-rose-300',
          strong && value < 0 && toneText.danger,
        )}
      >
        {sign && value !== 0 && `${sign} `}
        {formatMoney(Math.abs(value))}
      </dd>
    </div>
  );
}

/** Escala do eixo com passos redondos (1, 2, 2,5 ou 5 vezes uma potência de 10). */
function scale(low: number, high: number) {
  const top = high - low < 1 ? low + 100 : high;
  const rough = (top - low) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((size) => size >= rough)!;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

/** Rótulo sobre um ponto, sem sair do gráfico nas pontas. */
function Pill({
  x,
  y,
  below,
  className,
  children,
}: {
  x: number;
  y: number;
  below?: boolean;
  className: string;
  children: string;
}) {
  const shift = x < 12 ? '0' : x > 88 ? '-100%' : '-50%';
  return (
    <span
      className={cn(
        'absolute rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums',
        className,
      )}
      style={{
        left: `${x}%`,
        top: below ? `calc(${y}% + 0.6rem)` : `calc(${y}% - 2rem)`,
        transform: `translateX(${shift})`,
      }}
    >
      {children}
    </span>
  );
}

function ProfitChart({ series, month }: { series: ForecastPoint[]; month: string }) {
  const values = series.flatMap((point) =>
    [point.actual, point.projected].filter((value): value is number => value !== null),
  );
  const { min, max, ticks } = scale(Math.min(0, ...values), Math.max(0, ...values));
  const todayIndex = series.findIndex((point) => point.projected !== null);
  const last = series.length - 1;
  const x = (index: number) => (last ? (index / last) * 100 : 50);
  const y = (value: number) => 100 - ((value - min) / (max - min)) * 100;
  const path = (points: Array<[number, number]>) =>
    points.map(([px, py], index) => `${index ? 'L' : 'M'}${px * 10},${py * 10}`).join('');
  const area = (points: Array<[number, number]>) =>
    `${path(points)}L${points.at(-1)![0] * 10},${y(0) * 10}L${points[0][0] * 10},${y(0) * 10}Z`;
  const actual = series
    .slice(0, todayIndex + 1)
    .map((point, index): [number, number] => [x(index), y(point.actual ?? 0)]);
  const projected = series
    .slice(todayIndex)
    .map((point, index): [number, number] => [
      x(todayIndex + index),
      y(index ? (point.projected ?? 0) : (point.actual ?? 0)),
    ]);
  const today = series[todayIndex];
  const end = series[last];
  // Dia 1, o último e os múltiplos de 5 (no celular, de 10), sem encostar no último.
  const labels = series
    .map((point, index) => ({ index, day: point.day.slice(8, 10) }))
    .filter(
      ({ index, day }) =>
        index === 0 || index === last || (Number(day) % 5 === 0 && last - index > 2),
    );

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Lucro acumulado em {month}: {formatMoney(today.actual ?? 0)} até hoje e projeção de{' '}
        {formatMoney(end.projected ?? 0)} no fim do mês.
      </figcaption>
      <div className="mt-10 grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2" aria-hidden="true">
        <div className="relative h-52 text-right text-xs text-muted-foreground tabular-nums sm:h-60 lg:h-80">
          {ticks.map((tick) => (
            <span
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
              key={tick}
              style={{ top: `${y(tick)}%` }}
            >
              {axisMoney.format(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-52 sm:h-60 lg:h-80">
          <svg
            className="absolute inset-0 size-full overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 1000 1000"
          >
            {ticks.map((tick) => (
              <line
                className={tick === 0 && min < 0 ? 'stroke-foreground/25' : 'stroke-border'}
                key={tick}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                x1={0}
                x2={1000}
                y1={y(tick) * 10}
                y2={y(tick) * 10}
              />
            ))}
            {todayIndex < last && (
              <line
                className="stroke-muted-foreground/40"
                strokeDasharray="3 4"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                x1={x(todayIndex) * 10}
                x2={x(todayIndex) * 10}
                y1={0}
                y2={1000}
              />
            )}
            {projected.length > 1 && (
              <>
                <path className="fill-primary/[0.07]" d={area(projected)} />
                <path
                  className="fill-none stroke-primary"
                  d={path(projected)}
                  strokeDasharray="7 6"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            <path className="fill-emerald-500/15" d={area(actual)} />
            <path
              className="fill-none stroke-emerald-600 dark:stroke-emerald-400"
              d={path(actual)}
              strokeLinejoin="round"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {actual.map(([px, py], index) => (
            <span
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600 ring-2 ring-card dark:bg-emerald-400',
                index === todayIndex ? 'size-2.5' : 'size-1.5',
              )}
              key={px}
              style={{ left: `${px}%`, top: `${py}%` }}
            />
          ))}
          {todayIndex < last && (
            <span
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
              style={{ left: '100%', top: `${y(end.projected ?? 0)}%` }}
            />
          )}
          <Pill
            below={todayIndex < last && last - todayIndex < last / 4}
            className="bg-emerald-600 text-white dark:bg-emerald-500"
            x={x(todayIndex)}
            y={y(today.actual ?? 0)}
          >
            {formatMoney(today.actual ?? 0)}
          </Pill>
          {todayIndex < last && (
            <Pill className="bg-primary/10 text-primary" x={100} y={y(end.projected ?? 0)}>
              {formatMoney(end.projected ?? 0)}
            </Pill>
          )}
        </div>
        <div className="relative col-start-2 mt-2 h-4 text-xs text-muted-foreground tabular-nums">
          {labels.map(({ index, day }) => (
            <span
              className={cn(
                'absolute',
                index === 0 ? '' : index === last ? '-translate-x-full' : '-translate-x-1/2',
                index !== 0 && index !== last && Number(day) % 10 !== 0 && 'hidden sm:block',
              )}
              key={index}
              style={{ left: `${x(index)}%` }}
            >
              {day}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function Scenario({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint: string;
  value: number;
  tone: Tone;
}) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1',
        toneSurface[tone],
      )}
    >
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn('shrink-0 font-semibold tabular-nums', value < 0 && toneText.danger)}>
        {formatMoney(value)}
      </span>
    </li>
  );
}

/**
 * Lucros projetados (Financeiro): onde o lucro do mês deve fechar, como chega
 * lá dia a dia, de onde sai cada parte e a faixa entre semanas fracas e fortes.
 */
export default function ProfitForecast({ forecast }: { forecast: MonthForecast }) {
  const month = monthName(forecast.month);
  const previous = monthName(forecast.previous.month);
  const lastDay = forecast.series.at(-1)?.day ?? `${forecast.month}-01`;
  const today = forecast.series.find((point) => point.projected !== null)?.day ?? lastDay;
  const pace = forecast.estimated.margin - forecast.estimated.looseExpense;
  const change =
    forecast.previous.complete && forecast.previous.income > 0
      ? Math.round((forecast.likely.income / forecast.previous.income - 1) * 100)
      : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Previsão de {month}</h2>
          {!isEmpty(forecast) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {forecast.daysLeft
                ? `Onde o mês fecha se os ${forecast.daysLeft} dias que faltam seguirem o ritmo da loja.`
                : 'Último dia do mês: falta só o resto de hoje.'}
            </p>
          )}
        </div>
        {forecast.confidence === 'low' && <Badge variant="warning">Estimativa ainda fraca</Badge>}
      </div>

      {isEmpty(forecast) ? (
        <EmptyState
          title="Ainda não há movimento no caixa para prever o mês"
          description="A projeção aparece depois das primeiras vendas."
        />
      ) : (
        <>
          <StatGroup aria-label="Resumo da previsão" className="grid-cols-2 xl:grid-cols-4">
            <StatCard
              detail={`De ${shortDate(`${forecast.month}-01`)} a ${shortDate(today)}`}
              icon={Wallet}
              label="Lucro até hoje"
              tone="success"
              value={formatMoney(forecast.realized.profit)}
              valueTone={forecast.realized.profit < 0 ? 'danger' : undefined}
            />
            <StatCard
              detail="Lucro de um dia típico, sem as contas"
              icon={Gauge}
              label="Média por dia aberto"
              value={formatMoney(forecast.perOpenDay)}
            />
            <StatCard
              detail={`${forecast.openDaysLeft} com a loja aberta, até ${shortDate(lastDay)}`}
              icon={CalendarDays}
              label="Dias restantes"
              tone="info"
              value={`${forecast.daysLeft} ${forecast.daysLeft === 1 ? 'dia' : 'dias'}`}
            />
            <StatCard
              className="bg-[color-mix(in_oklab,var(--primary)_7%,var(--card))]"
              detail={`Mínimo de ${formatMoney(forecast.floor.profit)}, sem vendas novas`}
              icon={TrendingUp}
              label="Lucro projetado"
              tone="brand"
              value={formatMoney(forecast.likely.profit)}
              valueTone={forecast.likely.profit < 0 ? 'danger' : 'brand'}
            />
          </StatGroup>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section
              aria-labelledby="profit-chart-title"
              className="min-w-0 rounded-xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 id="profit-chart-title" className="font-semibold">
                  Evolução do lucro no mês
                </h3>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Lucro real, acumulado
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" />
                    Projeção
                  </span>
                </div>
              </div>
              <ProfitChart month={month} series={forecast.series} />
              <div className="mt-5 grid gap-1 border-t pt-4 text-sm">
                <p>
                  Faturamento previsto{' '}
                  <strong className="tabular-nums">{formatMoney(forecast.likely.income)}</strong>
                  {change !== null && (
                    <span className="text-muted-foreground">
                      {' '}
                      (
                      {change === 0
                        ? `igual a ${previous}`
                        : `${Math.abs(change)}% ${change > 0 ? 'acima' : 'abaixo'} de ${previous}`}
                      )
                    </span>
                  )}
                </p>
                {forecast.perOpenDayToMatchPrevious > 0 && (
                  <p className="text-muted-foreground">
                    Para faturar igual a {previous}, faltam{' '}
                    {formatMoney(forecast.perOpenDayToMatchPrevious)} por dia de loja aberta.
                  </p>
                )}
              </div>
            </section>

            <aside className="grid content-start gap-6 rounded-xl border bg-card p-4 text-sm sm:p-5">
              <section aria-labelledby="profit-breakdown-title">
                <h3 id="profit-breakdown-title" className="mb-3 font-semibold">
                  De onde sai a projeção
                </h3>
                <dl className="grid gap-2">
                  <Line
                    hint="Faturamento menos o custo das peças"
                    label="Margem até hoje"
                    sign="+"
                    value={forecast.realized.margin}
                  />
                  <Line
                    hint="Sem compras de peças; conta paga adiantada conta no mês em que vence"
                    label="Saídas já feitas"
                    sign="−"
                    value={forecast.realized.expense}
                  />
                  {forecast.basis === 'pace' ? (
                    <Line
                      hint="Média de cada dia da semana, menos os gastos avulsos de costume"
                      label={
                        forecast.daysLeft
                          ? `Ritmo dos ${forecast.daysLeft} dias que faltam`
                          : 'Resto de hoje'
                      }
                      sign={pace < 0 ? '−' : '+'}
                      value={pace}
                    />
                  ) : (
                    <Line
                      hint="Margem das OS prontas esperando pagamento"
                      label="OS prontas a receber"
                      sign="+"
                      value={forecast.likely.profit - forecast.realized.profit + forecast.bills}
                    />
                  )}
                  <Line
                    hint="Contas cadastradas, inclusive recorrentes e atrasadas"
                    label="Contas que ainda vencem"
                    sign="−"
                    value={forecast.bills}
                  />
                  <Line label="Lucro projetado" sign="" strong value={forecast.likely.profit} />
                </dl>
                {!forecast.realized.expense &&
                  !forecast.bills &&
                  !forecast.estimated.looseExpense && (
                    <p className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
                      Nenhuma despesa lançada neste mês. Aluguel, energia e outras contas só entram
                      no cálculo depois de cadastradas em Receber e pagar.
                    </p>
                  )}
              </section>

              <section aria-labelledby="profit-scenarios-title">
                <h3 id="profit-scenarios-title" className="mb-3 font-semibold">
                  Cenários
                </h3>
                <ul className="grid gap-2">
                  <Scenario
                    hint="Sem nenhuma venda nova"
                    label="Mínimo"
                    tone="neutral"
                    value={forecast.floor.profit}
                  />
                  {forecast.scenarios && (
                    <Scenario
                      hint="Ritmo das 2 semanas mais fracas"
                      label="Conservador"
                      tone="warning"
                      value={forecast.scenarios.conservative}
                    />
                  )}
                  <Scenario
                    hint="Ritmo normal da loja"
                    label="Realista"
                    tone="brand"
                    value={forecast.likely.profit}
                  />
                  {forecast.scenarios && (
                    <Scenario
                      hint="Ritmo das 2 semanas mais fortes"
                      label="Otimista"
                      tone="success"
                      value={forecast.scenarios.optimistic}
                    />
                  )}
                </ul>
                {!forecast.scenarios && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Os cenários conservador e otimista aparecem com 4 semanas de movimento.
                  </p>
                )}
              </section>
            </aside>
          </div>

          <div className="flex gap-2.5 rounded-xl border bg-card p-4 text-sm text-muted-foreground sm:p-5">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="max-w-4xl leading-relaxed">
              <span className="font-medium text-foreground">Como calculamos. </span>
              {forecastExplanation}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Resumo de uma linha para o Início, com o caminho para a projeção completa. */
export function ForecastSummary({ forecast }: { forecast: MonthForecast }) {
  if (isEmpty(forecast)) return null;
  return (
    <section
      aria-labelledby="forecast-summary-title"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3"
    >
      <IconChip icon={TrendingUp} tone="brand" />
      <div className="min-w-0 flex-1">
        <h2 id="forecast-summary-title" className="text-sm text-muted-foreground">
          Lucro projetado para {monthName(forecast.month)}
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <strong
            className={cn(
              'font-display text-lg font-bold tracking-tight tabular-nums',
              forecast.likely.profit < 0 && toneText.danger,
            )}
          >
            {formatMoney(forecast.likely.profit)}
          </strong>
          <span className="text-sm text-muted-foreground">
            mínimo de {formatMoney(forecast.floor.profit)} sem vendas novas
            {forecast.confidence === 'low' && ', estimativa ainda fraca'}
          </span>
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href={PROFIT_FORECAST_PATH}>Ver projeção</Link>
      </Button>
    </section>
  );
}
