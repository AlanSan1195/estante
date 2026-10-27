import type { PageCountCache } from '../../reader-engine/types';
import { openEstanteDb } from './db';

/** Conteos de páginas por clave de layout (tipografía + pantalla + versión del libro). */
export class IdbPageCountCache implements PageCountCache {
  async get(key: string): Promise<Record<string, number> | null> {
    const db = await openEstanteDb();
    return (await db.get('pageCounts', key))?.counts ?? null;
  }

  async set(key: string, counts: Record<string, number>): Promise<void> {
    const db = await openEstanteDb();
    await db.put('pageCounts', { key, counts, savedAt: Date.now() });
  }
}
