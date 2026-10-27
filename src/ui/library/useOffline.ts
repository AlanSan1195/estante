import { useCallback, useEffect, useState } from 'react';
import {
  bookOfflineUrls,
  type OfflineRecord,
  type OfflineStatus,
  offlineStatus,
} from '../../core/domain/offline';
import type { CatalogEntry } from '../../core/domain/published';
import { fetchFreshManifest, offlineRepository, requestPersistentStorage } from '../services';

/** Copias sin conexión de los libros del estante y su descarga con progreso. */
export function useOffline() {
  const [supported, setSupported] = useState(false);
  const [records, setRecords] = useState<ReadonlyMap<string, OfflineRecord>>(new Map());
  const [progress, setProgress] = useState<ReadonlyMap<string, number>>(new Map());

  useEffect(() => {
    // En el servidor (SSR de la isla) no hay Cache Storage: se decide ya en el navegador.
    const ok = offlineRepository.supported();
    setSupported(ok);
    if (!ok) return;
    offlineRepository
      .list()
      .then((list) => setRecords(new Map(list.map((record) => [record.slug, record]))))
      .catch(() => {});
  }, []);

  const setFraction = useCallback(
    (slug: string, fraction: number | null) =>
      setProgress((current) => {
        const next = new Map(current);
        if (fraction === null) next.delete(slug);
        else next.set(slug, fraction);
        return next;
      }),
    [],
  );

  const status = useCallback(
    (book: CatalogEntry): OfflineStatus =>
      offlineStatus({
        supported,
        record: records.get(book.slug),
        currentHash: book.sourceHash,
        progress: progress.get(book.slug),
      }),
    [supported, records, progress],
  );

  const download = useCallback(
    async (book: CatalogEntry): Promise<OfflineRecord> => {
      setFraction(book.slug, 0);
      try {
        const manifest = await fetchFreshManifest(book.slug, book.sourceHash);
        const record = await offlineRepository.download(
          book.slug,
          bookOfflineUrls(manifest),
          manifest.sourceHash,
          (fraction) => setFraction(book.slug, fraction),
        );
        setRecords((current) => new Map(current).set(book.slug, record));
        // Pedir almacenamiento persistente: así el sistema no borra la copia por falta de espacio.
        requestPersistentStorage().catch(() => {});
        return record;
      } finally {
        setFraction(book.slug, null);
      }
    },
    [setFraction],
  );

  const remove = useCallback(async (book: CatalogEntry): Promise<void> => {
    await offlineRepository.remove(book.slug);
    setRecords((current) => {
      const next = new Map(current);
      next.delete(book.slug);
      return next;
    });
  }, []);

  const record = useCallback((slug: string) => records.get(slug) ?? null, [records]);

  return { supported, status, download, remove, record };
}
