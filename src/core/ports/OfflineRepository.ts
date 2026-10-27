import type { OfflineRecord } from '../domain/offline';

/** Copias de libros guardadas en el dispositivo para leer sin conexión. */
export interface OfflineRepository {
  /** ¿Puede este navegador guardar libros? (Cache Storage en contexto seguro). */
  supported(): boolean;
  get(slug: string): Promise<OfflineRecord | null>;
  list(): Promise<OfflineRecord[]>;
  /**
   * Descarga y guarda los archivos del libro. Es atómica: si un archivo falla, la copia anterior
   * (si existía) se conserva intacta.
   */
  download(
    slug: string,
    urls: readonly string[],
    sourceHash: string,
    onProgress?: (fraction: number) => void,
  ): Promise<OfflineRecord>;
  remove(slug: string): Promise<void>;
}
