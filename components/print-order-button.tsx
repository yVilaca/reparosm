'use client';

import { Button } from '@/components/ui/button';

export default function PrintOrderButton() {
  return (
    <Button onClick={() => window.print()} type="button">
      Imprimir / salvar PDF
    </Button>
  );
}
