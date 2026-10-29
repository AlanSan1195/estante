import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * Código QR como SVG (un solo `path`), con margen de 4 módulos. Usa los colores del tema: el
 * fondo es claro y los módulos oscuros en ambos temas, porque las cámaras leen mejor ese contraste.
 */
export function QrCode({ value, size = 184 }: { value: string; size?: number }) {
  const { path, side } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 4 });
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, side: qr.size };
  }, [value]);

  return (
    <svg
      className="pwa-qr"
      data-testid="install-qr"
      role="img"
      aria-label={`Código QR de ${value}`}
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
