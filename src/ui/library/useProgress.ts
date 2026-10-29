import { useCallback, useEffect, useState } from 'react';
import type { ReadingProgress } from '../../core/domain/location';
import { progressRepository } from '../services';

/** Progreso de todos los libros desde IndexedDB (null mientras carga). */
export function useAllProgress() {
  const [progress, setProgress] = useState<Map<string, ReadingProgress> | null>(null);

  const reload = useCallback(async () => {
    const list = await progressRepository.list().catch(() => [] as ReadingProgress[]);
    setProgress(new Map(list.map((p) => [p.bookSlug, p])));
  }, []);

  useEffect(() => {
    reload().catch(() => {});
    // Al volver a la pestaña (o tras navegar con el historial) el progreso pudo cambiar.
    const onShow = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [reload]);

  return { progress, reload, setProgress };
}

export function readerHref(slug: string, blockId?: string): string {
  return blockId ? `/leer/${slug}?b=${encodeURIComponent(blockId)}` : `/leer/${slug}`;
}
