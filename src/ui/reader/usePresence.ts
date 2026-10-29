import { useEffect, useState } from 'react';

/**
 * Mantiene montado un elemento mientras dura su animación de salida.
 *
 * @param open si debería verse.
 * @param exitMs lo que dura la salida en el CSS.
 * @returns `mounted`: hay que pintarlo; `closing`: está saliendo (animación de cierre, sin toques).
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, closing: !open && mounted };
}
