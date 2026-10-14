import qrcode from 'qrcode-generator';

/**
 * QR code em SVG, um caminho só. Fundo branco e módulos escuros sempre (até no
 * tema escuro), com a margem que as câmeras precisam para ler.
 */
export default function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
  const margin = 3;
  const box = size + margin * 2;
  return (
    <svg
      viewBox={`${-margin} ${-margin} ${box} ${box}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-margin} y={-margin} width={box} height={box} rx="2" fill="#fff" />
      <path d={path} fill="#1b1636" />
    </svg>
  );
}
