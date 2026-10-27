/**
 * Lectura sin conexión: qué precarga el service worker como app shell y en qué estado está la
 * copia descargada de cada libro. Funciones puras: el SW, la integración y la UI las comparten.
 */

import { BOOKS_BASE_PATH, type BookManifest, manifestPath } from './published';

export const SHELL_CACHE_PREFIX = 'shell-';
export const BOOK_CACHE_PREFIX = 'books-';
/** Página que el SW sirve cuando no hay red ni copia de la ruta pedida. */
export const OFFLINE_PAGE = '/offline/';

export function bookCacheName(slug: string): string {
  return `${BOOK_CACHE_PREFIX}${slug}`;
}

/** Solo se precargan los subconjuntos latinos de las fuentes: el español no necesita más. */
const LATIN_FONT = /-latin-wght-(?:normal|italic)\.[\w-]+\.woff2$/;
const FONT = /\.(?:woff2?|ttf|otf)$/;
const COVER = /^books\/[^/]+\/cover\.(?:svg|jpe?g|png|webp)$/;
const ROOT_ASSET = /^(?:manifest\.webmanifest|favicon\.svg|[\w-]+\.png|icons\/.+\.(?:png|svg))$/;

/**
 * Elige, de los archivos de la salida del build, los que forman el app shell: páginas, JS y CSS con
 * hash, fuentes latinas, iconos, manifest, catálogo y portadas. Los capítulos, el manifest y la
 * búsqueda de cada libro no: se descargan por libro desde la Biblioteca.
 *
 * @param files rutas relativas a la carpeta de salida, con `/` (p. ej. `leer/twick/index.html`).
 * @returns URLs absolutas del sitio, ordenadas y sin duplicados.
 */
export function selectPrecache(files: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const raw of files) {
    const file = raw.replace(/^\/+/, '');
    const url = precacheUrl(file);
    if (url) urls.add(url);
  }
  return [...urls].sort();
}

function precacheUrl(file: string): string | null {
  if (file.startsWith('books/')) {
    if (file === 'books/index.json' || COVER.test(file)) return `/${file}`;
    return null;
  }
  if (file.endsWith('.html')) {
    if (file === 'index.html') return '/';
    if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
    return `/${file}`;
  }
  if (file.startsWith('_astro/')) {
    if (FONT.test(file)) return LATIN_FONT.test(file) ? `/${file}` : null;
    return `/${file}`;
  }
  return ROOT_ASSET.test(file) ? `/${file}` : null;
}

/** Todo lo que hace falta para leer un libro sin red: manifest, capítulos, búsqueda y portada. */
export function bookOfflineUrls(
  manifest: Pick<BookManifest, 'slug' | 'chapters' | 'search' | 'cover'>,
): string[] {
  const urls = [
    manifestPath(manifest.slug),
    ...manifest.chapters.map((chapter) => chapter.href),
    manifest.search,
    manifest.cover,
  ];
  return [...new Set(urls.filter((url) => url.startsWith(`${BOOKS_BASE_PATH}/`)))];
}

/** Copia sin conexión de un libro guardada en el dispositivo. */
export interface OfflineRecord {
  slug: string;
  /** Hash del MD de la versión descargada (para detectar que hay una nueva). */
  sourceHash: string;
  /** Epoch ms. */
  downloadedAt: number;
  files: number;
  bytes: number;
}

export type OfflineState =
  /** El navegador no puede guardar libros (sin Cache Storage o contexto no seguro). */
  | 'unavailable'
  | 'none'
  | 'downloading'
  | 'ready'
  /** Descargado, pero el sitio publicó una versión nueva del libro. */
  | 'stale';

export interface OfflineStatus {
  state: OfflineState;
  /** 0–1 mientras se descarga. */
  fraction: number | null;
}

export function offlineStatus(input: {
  supported: boolean;
  record: OfflineRecord | null | undefined;
  currentHash: string;
  /** Progreso de una descarga en curso (0–1) o null si no hay ninguna. */
  progress: number | null | undefined;
}): OfflineStatus {
  if (!input.supported) return { state: 'unavailable', fraction: null };
  if (input.progress !== null && input.progress !== undefined) {
    return { state: 'downloading', fraction: Math.min(1, Math.max(0, input.progress)) };
  }
  if (!input.record) return { state: 'none', fraction: null };
  if (input.record.sourceHash !== input.currentHash) return { state: 'stale', fraction: null };
  return { state: 'ready', fraction: null };
}

export function offlineLabel(status: OfflineStatus): string {
  switch (status.state) {
    case 'unavailable':
      return 'Este navegador no puede guardar libros sin conexión';
    case 'none':
      return 'Descargar para leer sin conexión';
    case 'downloading':
      return `Descargando… ${Math.round((status.fraction ?? 0) * 100)} %`;
    case 'ready':
      return 'Disponible sin conexión';
    case 'stale':
      return 'Hay una versión nueva por descargar';
  }
}

/** Tamaño legible en español (los libros pesan KB o pocos MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
