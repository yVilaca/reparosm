import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { cn } from 'cn';
import RefTag from '@/components/ui/ref-tag';
import { toneDot, toneSurface, toneText } from '@/components/ui/tone';
import { formatMoney, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import {
  amountDue,
  relativeTime as when,
  trackingDetail,
  trackingState,
  trackingSteps,
  trackingTimeline,
  type PublicTracking,
} from '@/lib/order-tracking';

const digits = (value: string) => value.replace(/\D/g, '');

/**
 * A página que o cliente abre pelo link: a situação em uma frase, o progresso,
 * quanto falta pagar, como falar com a loja, a linha do tempo e o serviço.
 */
export default function TrackingView({
  tracking,
  now = new Date(),
}: {
  tracking: PublicTracking;
  now?: Date;
}) {
  const { shop, order } = tracking;
  const state = trackingState(order.stage, order.status);
  // Situações neutras (recebido, entregue) usam a cor da marca, não cinza.
  const tone = state.tone === 'neutral' ? 'brand' : state.tone;
  const timeline = trackingTimeline(tracking);
  const updatedAt = [...timeline].reverse().find((item) => item.at)?.at ?? order.createdAt;
  const due = amountDue(order);
  const cancelled = state.key === 'cancelled';
  const hello = `Olá! Gostaria de falar sobre a ${order.code} (${order.device}).`;
  const contact = [
    shop.phone && hasValidWhatsapp(shop.phone)
      ? { label: 'WhatsApp', href: whatsappUrl(shop.phone, hello), icon: MessageCircle }
      : null,
    shop.phone ? { label: 'Ligar', href: `tel:${digits(shop.phone)}`, icon: Phone } : null,
    shop.address
      ? {
          label: 'Como chegar',
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`,
          icon: MapPin,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-6 sm:py-10">
      <header className="flex items-center gap-3">
        {shop.logoUrl ? (
          // Logo enviada pela loja, servida pela rota pública de logos.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-11 shrink-0 rounded-xl bg-card object-contain ring-1 ring-foreground/10"
            src={shop.logoUrl}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground"
          >
            {shop.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{shop.name}</p>
          <p className="text-sm text-muted-foreground">Acompanhamento do serviço</p>
        </div>
      </header>

      <section
        aria-labelledby="tracking-status"
        className="rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgb(27_22_54/0.06)] ring-1 ring-foreground/10 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {order.firstName ? `Olá, ${order.firstName}. ` : ''}Seu {order.device}
          </p>
          <RefTag code={order.code} size="md" />
        </div>
        <h1
          id="tracking-status"
          className={cn(
            'mt-3 flex items-start gap-2.5 font-display text-[1.75rem] leading-tight font-bold tracking-tight sm:text-3xl',
            toneText[tone],
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              // Alinhada à primeira linha quando o título quebra.
              'mt-[0.75rem] size-3 shrink-0 rounded-full',
              toneDot[tone],
              state.key !== 'delivered' && !cancelled && 'animate-pulse motion-reduce:animate-none',
            )}
          />
          {state.title}
        </h1>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed">{trackingDetail(tracking)}</p>

        {!cancelled && (
          <ol aria-label="Etapas do serviço" className="mt-5 grid grid-cols-4 gap-1.5">
            {trackingSteps.map((label, index) => {
              const done = index <= state.step;
              const current = index === state.step;
              return (
                <li aria-current={current ? 'step' : undefined} className="min-w-0" key={label}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block h-1.5 rounded-full',
                      done ? toneDot[tone] : 'bg-foreground/10',
                    )}
                  />
                  <span
                    className={cn(
                      'mt-1.5 block text-xs leading-tight',
                      current
                        ? 'font-semibold text-foreground'
                        : done
                          ? 'text-foreground/75'
                          : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Atualizado {when(updatedAt, now)}</p>
      </section>

      {!cancelled && order.total > 0 && (
        <section
          aria-label="Pagamento"
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl px-5 py-4 ring-1',
            due > 0
              ? toneSurface[state.key === 'ready' ? 'warning' : 'neutral']
              : toneSurface.success,
          )}
        >
          <div>
            <p className="font-medium">
              {due <= 0
                ? 'Pago'
                : state.key === 'ready'
                  ? 'A pagar na retirada'
                  : state.key === 'delivered'
                    ? 'Falta pagar'
                    : 'Valor do serviço'}
            </p>
            {due > 0 && order.paid > 0 && (
              <p className="text-xs text-muted-foreground">
                Já pago {formatMoney(order.paid)} de {formatMoney(order.total)}
              </p>
            )}
          </div>
          <strong className="font-display text-xl tabular-nums">
            {formatMoney(due > 0 ? due : order.total)}
          </strong>
        </section>
      )}

      {contact.length > 0 && (
        <nav
          aria-label="Falar com a loja"
          className={cn(
            'grid gap-2',
            ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][contact.length - 1],
          )}
        >
          {contact.map(({ label, href, icon: Icon }, index) => (
            <a
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                index === 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-card ring-1 ring-foreground/10 hover:bg-muted',
              )}
              href={href}
              key={label}
              rel="noopener noreferrer"
              target={href.startsWith('tel:') ? undefined : '_blank'}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </a>
          ))}
        </nav>
      )}

      <section
        aria-labelledby="tracking-history"
        className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10"
      >
        <h2 id="tracking-history" className="font-semibold">
          Linha do tempo
        </h2>
        <ol className="mt-4 grid gap-0">
          {[...timeline].reverse().map((item, index, items) => (
            <li
              className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0"
              key={`${item.title}-${index}`}
            >
              {index < items.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 bottom-0 left-[0.4375rem] w-px bg-foreground/15"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative mt-1 size-3.5 rounded-full ring-4 ring-card',
                  item.current ? toneDot[tone] : 'bg-foreground/20',
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={item.current ? 'font-semibold' : 'text-foreground/80'}>
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.at ? when(item.at, now) : 'Agora'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="tracking-service"
        className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10"
      >
        <h2 id="tracking-service" className="font-semibold">
          Serviço
        </h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">Aparelho</dt>
            <dd>{order.device}</dd>
          </div>
          {order.problem && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">Problema</dt>
              <dd>{order.problem}</dd>
            </div>
          )}
          {order.service && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">Serviço</dt>
              <dd>{order.service}</dd>
            </div>
          )}
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="tabular-nums">
              {cancelled
                ? 'Sem cobrança'
                : order.total > 0
                  ? formatMoney(order.total)
                  : 'A loja informa o valor'}
            </dd>
          </div>
          {order.warrantyUntil && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">Garantia</dt>
              <dd>Até {order.warrantyUntil.split('-').reverse().join('/')}</dd>
            </div>
          )}
        </dl>
      </section>

      {(shop.address || shop.hours) && (
        <section
          aria-labelledby="tracking-shop"
          className="rounded-2xl bg-card p-5 text-sm ring-1 ring-foreground/10"
        >
          <h2 id="tracking-shop" className="font-semibold">
            Onde retirar
          </h2>
          <div className="mt-3 grid gap-2">
            {shop.address && (
              <p className="flex gap-2">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                {shop.address}
              </p>
            )}
            {shop.hours && (
              <p className="flex gap-2">
                <Clock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                {shop.hours}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="px-1 pt-2 text-center text-xs leading-relaxed text-muted-foreground">
        Este link é só seu: ele mostra o andamento desta OS e não permite alterar nada.
        <br />
        Acompanhamento por ReparoSM
      </footer>
    </main>
  );
}
