import { BOOK_CACHE_PREFIX, bookCacheName, type OfflineRecord } from '../../core/domain/offline';
import type { OfflineRepository } from '../../core/ports';

/** Entrada sintética, dentro de la misma caché del libro, con los datos de la descarga. */
const RECORD_URL = '/__estante/offline.json';
/** Descargas simultáneas: suficiente para un libro de ~25 archivos sin saturar la red móvil. */
const CONCURRENCY = 4;

/**
 * Copias sin conexión sobre Cache Storage: una caché `books-<slug>` por libro, que el service
 * worker consulta primero (cache-first) al pedir `/books/<slug>/*`.
 */
export class CacheOfflineRepository implements OfflineRepository {
  supported(): boolean {
    return typeof caches !== 'undefined' && globalThis.isSecureContext === true;
  }

  async get(slug: string): Promise<OfflineRecord | null> {
    if (!this.supported()) return null;
    const name = bookCacheName(slug);
    // `caches.open` crearía una caché vacía: primero se comprueba que exista.
    if (!(await caches.has(name))) return null;
    const cache = await caches.open(name);
    const response = await cache.match(RECORD_URL);
    if (!response) return null;
    try {
      return (await response.json()) as OfflineRecord;
    } catch {
      return null;
    }
  }

  async list(): Promise<OfflineRecord[]> {
    if (!this.supported()) return [];
    const names = (await caches.keys()).filter((name) => name.startsWith(BOOK_CACHE_PREFIX));
    const records = await Promise.all(
      names.map((name) => this.get(name.slice(BOOK_CACHE_PREFIX.length))),
    );
    return records.filter((record): record is OfflineRecord => record !== null);
  }

  async download(
    slug: string,
    urls: readonly string[],
    sourceHash: string,
    onProgress?: (fraction: number) => void,
  ): Promise<OfflineRecord> {
    if (!this.supported()) throw new Error('Este navegador no puede guardar libros sin conexión.');
    const files: { url: string; response: Response; size: number }[] = [];
    let done = 0;
    onProgress?.(0);

    // Primero todo a memoria; solo si todo llegó se reemplaza la copia anterior (atómico).
    const queue = [...urls];
    const worker = async () => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        files.push(await fetchForOffline(url, sourceHash));
        done += 1;
        onProgress?.(done / urls.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

    const record: OfflineRecord = {
      slug,
      sourceHash,
      downloadedAt: Date.now(),
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    };
    const name = bookCacheName(slug);
    await caches.delete(name);
    const cache = await caches.open(name);
    await Promise.all(files.map((file) => cache.put(file.url, file.response)));
    await cache.put(
      RECORD_URL,
      new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } }),
    );
    return record;
  }

  async remove(slug: string): Promise<void> {
    if (!this.supported()) return;
    await caches.delete(bookCacheName(slug));
  }
}

/**
 * Descarga un archivo saltándose la copia guardada: `?offline=<hash>` hace que el service worker
 * vaya a la red (si no, devolvería la versión vieja al actualizar un libro).
 */
async function fetchForOffline(
  url: string,
  sourceHash: string,
): Promise<{ url: string; response: Response; size: number }> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}offline=${encodeURIComponent(sourceHash)}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`No se pudo descargar ${url} (${response.status}).`);
  const body = await response.blob();
  const headers = new Headers();
  const type = response.headers.get('content-type');
  if (type) headers.set('content-type', type);
  return { url, response: new Response(body, { headers }), size: body.size };
}
