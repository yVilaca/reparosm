'use client';

import { Button } from '@/components/ui/button';

export default function PrintOrderButton({ copies }: { copies: number }) {
  const updateCopies = (value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('copies', value);
    window.location.assign(url);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground" htmlFor="print-copies">
        Vias
      </label>
      <select
        aria-label="Quantidade de vias para imprimir"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        id="print-copies"
        onChange={(event) => updateCopies(event.target.value)}
        value={copies}
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <Button onClick={() => window.print()} type="button">
        Imprimir / salvar PDF
      </Button>
    </div>
  );
}
