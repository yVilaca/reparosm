import type { ReactNode } from 'react';

/** What the bench illustration shows: it follows the form beside it. */
export type AuthStatus = 'idle' | 'busy' | 'error' | 'ok';

const statusLabel: Record<AuthStatus, string> = {
  idle: 'DIAGNÓSTICO',
  busy: 'VERIFICANDO',
  error: 'NÃO CONFERE',
  ok: 'LIBERADO',
};

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  status = 'idle',
  stepKey,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  status?: AuthStatus;
  /** Changing it replays the entrance animation (e.g. login → forgot). */
  stepKey?: string;
}) {
  return (
    <main className="grid min-h-svh bg-canvas text-foreground lg:grid-cols-[minmax(25rem,0.92fr)_minmax(30rem,1.08fr)]">
      <aside
        data-status={status}
        className="auth-blueprint relative hidden min-h-svh overflow-hidden bg-brand-ink p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14"
      >
        <span
          aria-label="ReparoSM"
          className="auth-logo auth-logo-on-dark relative z-10 block w-[190px]"
          role="img"
        />
        <div className="relative z-10 mx-auto w-full max-w-lg" aria-hidden="true">
          <svg className="w-full" viewBox="0 0 520 430" fill="none">
            <path
              d="M171 47h178c22 0 40 18 40 40v256c0 22-18 40-40 40H171c-22 0-40-18-40-40V87c0-22 18-40 40-40Z"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-white/35"
            />
            <path
              d="M211 72h98M229 354h62"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-white/35"
            />
            <path
              d="M174 118h172v174H174zM201 147h118M201 174h73M201 230h118M201 257h88"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="5 8"
              className="auth-trace text-primary/90"
            />
            <rect className="auth-scan" x="176" y="120" width="168" height="3" rx="1.5" />
            <path
              d="m84 137 32 18m-38 55 39-4m286-63 36-21m-37 92 39 11M114 319l-34 21m324-19 34 25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="auth-wires text-white/25"
            />
            <circle
              cx="76"
              cy="132"
              r="5"
              style={{ animationDelay: '0.00s' }}
              className="auth-dot fill-primary"
            />
            <circle
              cx="72"
              cy="211"
              r="5"
              style={{ animationDelay: '0.35s' }}
              className="auth-dot fill-white/60"
            />
            <circle
              cx="445"
              cy="119"
              r="5"
              style={{ animationDelay: '0.70s' }}
              className="auth-dot fill-primary"
            />
            <circle
              cx="447"
              cy="227"
              r="5"
              style={{ animationDelay: '1.05s' }}
              className="auth-dot fill-white/60"
            />
            <circle
              cx="75"
              cy="344"
              r="5"
              style={{ animationDelay: '1.40s' }}
              className="auth-dot fill-white/35"
            />
            <circle
              cx="443"
              cy="350"
              r="5"
              style={{ animationDelay: '1.75s' }}
              className="auth-dot fill-primary"
            />
            <text
              x="260"
              y="211"
              textAnchor="middle"
              className="auth-readout fill-white font-mono text-[14px] tracking-[.22em]"
            >
              {statusLabel[status]}
            </text>
          </svg>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-white/50 uppercase">
            Repair System Master
          </p>
          <p className="font-display text-3xl leading-tight font-bold tracking-tight xl:text-4xl">
            Da bancada ao caixa, tudo no mesmo ritmo.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/60">
            A rotina da assistência organizada sem tirar o foco do reparo.
          </p>
        </div>
      </aside>

      <section className="flex min-h-svh flex-col px-5 py-6 sm:px-10 sm:py-10 lg:justify-center lg:px-16 xl:px-24">
        <header className="mb-16 flex items-center lg:hidden">
          <span aria-label="ReparoSM" className="auth-logo block w-[164px]" role="img" />
        </header>
        <div className="auth-enter mx-auto w-full max-w-[27rem]" key={stepKey}>
          <p className="mb-4 text-xs font-bold tracking-[0.18em] text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="font-display text-3xl leading-[1.12] font-bold tracking-[-0.025em] sm:text-[2.55rem]">
            {title}
          </h1>
          {description && (
            <div className="mt-4 text-sm leading-6 text-muted-foreground">{description}</div>
          )}
          <div className="mt-9">{children}</div>
          {footer && <footer className="mt-8 text-sm text-muted-foreground">{footer}</footer>}
        </div>
      </section>
    </main>
  );
}
