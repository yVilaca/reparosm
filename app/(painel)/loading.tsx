export default function LoadingPanel() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid gap-6">
      <span className="sr-only">Carregando tela…</span>
      <div aria-hidden="true" className="grid gap-6 motion-safe:animate-pulse">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-24 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
