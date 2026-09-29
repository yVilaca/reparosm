'use client';

export default function PrintOrderButton() {
  return (
    <button className="primary" type="button" onClick={() => window.print()}>
      Imprimir / salvar PDF
    </button>
  );
}
