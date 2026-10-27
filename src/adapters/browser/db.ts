import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Bookmark, Highlight } from '../../core/domain/annotations';
import type { ReadingProgress } from '../../core/domain/location';
import type { PracticeCard } from '../../core/domain/practice';
import type { ReaderPreferences } from '../../core/domain/preferences';

/**
 * Base de datos del navegador. Se crean de una vez todos los almacenes que usarán las fases
 * siguientes (marcadores, subrayados, checklists, práctica) para no migrar versiones después.
 */
export interface EstanteDB extends DBSchema {
  progress: { key: string; value: ReadingProgress };
  preferences: { key: string; value: Partial<ReaderPreferences> };
  pageCounts: {
    key: string;
    value: { key: string; counts: Record<string, number>; savedAt: number };
  };
  bookmarks: { key: string; value: Bookmark; indexes: { bookSlug: string } };
  highlights: { key: string; value: Highlight; indexes: { bookSlug: string } };
  checklists: { key: string; value: { bookSlug: string; items: Record<string, boolean> } };
  practice: { key: string; value: PracticeCard; indexes: { bookSlug: string } };
}

export const DB_NAME = 'estante';
export const DB_VERSION = 1;

let connection: Promise<IDBPDatabase<EstanteDB>> | null = null;

export function openEstanteDb(): Promise<IDBPDatabase<EstanteDB>> {
  connection ??= openDB<EstanteDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('progress'))
        db.createObjectStore('progress', { keyPath: 'bookSlug' });
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
      if (!db.objectStoreNames.contains('pageCounts'))
        db.createObjectStore('pageCounts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('bookmarks')) {
        db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('bookSlug', 'bookSlug');
      }
      if (!db.objectStoreNames.contains('highlights')) {
        db.createObjectStore('highlights', { keyPath: 'id' }).createIndex('bookSlug', 'bookSlug');
      }
      if (!db.objectStoreNames.contains('checklists'))
        db.createObjectStore('checklists', { keyPath: 'bookSlug' });
      if (!db.objectStoreNames.contains('practice')) {
        db.createObjectStore('practice', { keyPath: 'id' }).createIndex('bookSlug', 'bookSlug');
      }
    },
  });
  connection.catch(() => {
    connection = null;
  });
  return connection;
}

/** Pide al navegador que no borre los datos por falta de espacio (iOS lo respeta en apps instaladas). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
