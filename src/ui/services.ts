/**
 * Raíz de composición del navegador: aquí se eligen los adaptadores concretos de los puertos.
 * La UI pide repositorios a este módulo y nunca construye adaptadores por su cuenta.
 */

import { CacheOfflineRepository } from '../adapters/browser/cacheOfflineRepository';
import { requestPersistentStorage } from '../adapters/browser/db';
import { IdbAnnotationRepository } from '../adapters/browser/idbAnnotationRepository';
import { IdbPageCountCache } from '../adapters/browser/idbPageCountCache';
import { IdbPracticeRepository } from '../adapters/browser/idbPracticeRepository';
import { IdbPreferencesRepository } from '../adapters/browser/idbPreferencesRepository';
import { IdbProgressRepository, ProgressSaver } from '../adapters/browser/idbProgressRepository';
import {
  type BookManifest,
  CATALOG_PATH,
  type LibraryCatalog,
  manifestPath,
  type SearchDocument,
  searchPath,
} from '../core/domain/published';

export const progressRepository = new IdbProgressRepository();
export const preferencesRepository = new IdbPreferencesRepository();
export const pageCountCache = new IdbPageCountCache();
export const progressSaver = new ProgressSaver(progressRepository);
export const annotationRepository = new IdbAnnotationRepository();
export const practiceRepository = new IdbPracticeRepository();
export const offlineRepository = new CacheOfflineRepository();

export { requestPersistentStorage };

export async function fetchManifest(slug: string): Promise<BookManifest> {
  const response = await fetch(manifestPath(slug));
  if (!response.ok) throw new Error(`No se encontró el libro "${slug}" (${response.status}).`);
  return (await response.json()) as BookManifest;
}

/**
 * Manifest recién publicado, sin pasar por la copia descargada (para descargar o actualizar un
 * libro): el parámetro `offline` hace que el service worker vaya a la red.
 */
export async function fetchFreshManifest(slug: string, sourceHash: string): Promise<BookManifest> {
  const response = await fetch(`${manifestPath(slug)}?offline=${encodeURIComponent(sourceHash)}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`No se encontró el libro "${slug}" (${response.status}).`);
  return (await response.json()) as BookManifest;
}

export async function fetchCatalog(): Promise<LibraryCatalog> {
  const response = await fetch(CATALOG_PATH);
  if (!response.ok) throw new Error(`No se pudo leer el catálogo (${response.status}).`);
  return (await response.json()) as LibraryCatalog;
}

const searchDocs = new Map<string, Promise<SearchDocument[]>>();

/** Documentos de búsqueda de un libro (una descarga por sesión). */
export function fetchSearchDocuments(slug: string): Promise<SearchDocument[]> {
  let pending = searchDocs.get(slug);
  if (!pending) {
    pending = fetch(searchPath(slug)).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo leer el índice de "${slug}".`);
      return (await response.json()) as SearchDocument[];
    });
    pending.catch(() => searchDocs.delete(slug));
    searchDocs.set(slug, pending);
  }
  return pending;
}

const chapterHtml = new Map<string, Promise<string>>();

/** HTML publicado de un capítulo (para buscar la primera aparición de un término). */
export function fetchChapterText(href: string): Promise<string> {
  let pending = chapterHtml.get(href);
  if (!pending) {
    pending = fetch(href).then((response) => {
      if (!response.ok) throw new Error(`No se pudo leer ${href}.`);
      return response.text();
    });
    pending.catch(() => chapterHtml.delete(href));
    chapterHtml.set(href, pending);
  }
  return pending;
}
