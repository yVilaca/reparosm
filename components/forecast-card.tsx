import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { toneText } from '@/components/ui/tone';
import type { MonthForecast } from '@/lib/forecast';
import { formatMoney } from '@/lib/format';

const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );

/** Explicação do cálculo: a mesma que vai para quem pediu a funcionalidade. */
export const forecastExplanation =
  'A previsão soma o que já entrou e saiu no caixa neste mês com o que a loja costuma fazer nos dias que faltam, calculado pela média de cada dia da semana nas últimas 8 semanas (assim uma segunda fraca não pesa como um sábado cheio), já descontados o custo das peças e os gastos avulsos de costume. As contas a pagar cadastradas que vencem até o fim do mês, inclusive as recorrentes e as atrasadas, entram pelo valor exato, uma vez cada, em vez de serem estimadas. O mínimo considera só o que já aconteceu e as OS prontas esperando pagamento, sem nenhuma venda nova. Com menos de 3 semanas de movimento, a estimativa aparece como fraca.';

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
          sign === '−' && 'text-rose-700 dark:text-rose-300',
          strong && value < 0 && toneText.danger,
        )}
      >
        {sign && `${sign} `}
        {formatMoney(Math.abs(value))}
      </dd>
    </div>
  );
}

/**
 * Previsão do mês no Início: o lucro provável se o resto do mês seguir o ritmo
 * da loja, o mínimo sem vendas novas e de onde sai cada parte.
 */
export default function ForecastCard({ forecast }: { forecast: MonthForecast }) {
  const month = monthName(forecast.month);
  const previous = monthName(forecast.previous.month);
  const empty = forecast.confidence === 'none' && !forecast.realized.income && !forecast.bills;
  const pace = forecast.estimated.margin - forecast.estimated.looseExpense;
  const change =
    forecast.previous.income > 0
      ? Math.round((forecast.likely.income / forecast.previous.income - 1) * 100)
      : null;

  return (
    <section aria-labelledby="forecast-title" className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="forecast-title" className="font-semibold">
            Previsão de {month}
          </h2>
          {!empty && (
            <p className="mt-1 text-sm text-muted-foreground">
              {forecast.daysLeft
                ? `Onde o mês fecha se os ${forecast.daysLeft} dias que faltam seguirem o ritmo da loja.`
                : 'Último dia do mês: falta só o resto de hoje.'}
            </p>
          )}
        </div>
        {forecast.confidence === 'low' && <Badge variant="warning">Estimativa ainda fraca</Badge>}
      </div>

      {empty ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Ainda não há movimento no caixa para prever o mês. A previsão aparece depois das primeiras
          vendas.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <p className="text-sm text-muted-foreground">Lucro provável</p>
            <strong
              className={cn(
                'block font-display text-[2rem] leading-tight font-bold tracking-tight tabular-nums',
                forecast.likely.profit < 0 && toneText.danger,
              )}
            >
              {formatMoney(forecast.likely.profit)}
            </strong>
            <p className="text-sm text-muted-foreground">
              Mínimo de {formatMoney(forecast.floor.profit)}, sem nenhuma venda nova.
            </p>
            <p className="mt-4 text-sm">
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
              <p className="mt-1 text-sm text-muted-foreground">
                Para faturar igual a {previous}, faltam{' '}
                {formatMoney(forecast.perOpenDayToMatchPrevious)} por dia de loja aberta.
              </p>
            )}
          </div>
          <dl className="grid content-start gap-2 text-sm" aria-label="De onde sai a previsão">
            <Line
              hint="Faturamento menos o custo das peças"
              label="Margem até hoje"
              sign="+"
              value={forecast.realized.margin}
            />
            <Line label="Saídas já feitas" sign="−" value={forecast.realized.expense} />
            {forecast.basis === 'pace' ? (
              <Line
                hint="Média de cada dia da semana, menos os gastos avulsos"
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
            <Line label="Lucro provável" sign="" strong value={forecast.likely.profit} />
          </dl>
        </div>
      )}

      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Como calculamos</summary>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{forecastExplanation}</p>
      </details>
    </section>
  );
}
