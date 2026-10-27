/**
 * Formato publicado: lo que el pipeline escribe en `public/books` y lo que el lector, la biblioteca
 * y el service worker leen. Es el contrato entre el build y la interfaz.
 *
 * public/books/
 *   index.json                    → LibraryCatalog
 *   <slug>/manifest.json          → BookManifest
 *   <slug>/<chapterId>.html       → fragmento HTML de un capítulo (ver htmlRenderer)
 *   <slug>/search.json            → SearchDocument[]
 *   <slug>/cover.svg|jpg|png|webp → portada
 */

export const PUBLISHED_FORMAT_VERSION = 1;
export const BOOKS_BASE_PATH = '/books';

export interface BookPalette {
  /** Fondo principal y secundario de la portada (degradado). */
  background: string;
  backgroundAlt: string;
  /** Color del texto sobre la portada. */
  ink: string;
  /** Color de acento (filetes, autor, brillo en el estante). */
  accent: string;
}

export interface CatalogEntry {
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  /** Ruta absoluta servible: `/books/<slug>/cover.svg`. */
  cover: string;
  palette: BookPalette;
  chapters: number;
  totalWords: number;
  questions: number;
  terms: number;
  sourceHash: string;
  /** Fecha de modificación del MD (ISO). */
  updatedAt: string;
}

export interface LibraryCatalog {
  version: typeof PUBLISHED_FORMAT_VERSION;
  books: CatalogEntry[];
}

export interface ManifestSection {
  id: string;
  title: string;
  number: string | null;
  /** Bloque encabezado de la sección dentro del capítulo. */
  blockId: string;
  /** Palabras desde el inicio del capítulo hasta el encabezado. */
  wordStart: number;
}

export interface ManifestChapter {
  id: string;
  number: number | null;
  title: string;
  /** "Capítulo 5" o "Introducción". */
  label: string;
  /** Ruta absoluta servible del fragmento HTML. */
  href: string;
  /** Palabras acumuladas antes de este capítulo (para porcentajes globales). */
  wordStart: number;
  words: number;
  sections: ManifestSection[];
}

export interface PublishedGlossaryTerm {
  id: string;
  term: string;
  aliases: string[];
  definitionHtml: string;
  definitionText: string;
  chapterId: string;
  blockId: string;
}

export interface PublishedQuestion {
  id: string;
  number: number;
  group: string | null;
  questionHtml: string;
  questionText: string;
  answerHtml: string;
  chapterId: string;
  blockId: string;
}

export interface PublishedChecklist {
  blockId: string;
  chapterId: string;
  items: { id: string; text: string }[];
}

export interface BookManifest {
  version: typeof PUBLISHED_FORMAT_VERSION;
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  repo: string | null;
  cover: string;
  palette: BookPalette;
  sourceHash: string;
  updatedAt: string;
  totalWords: number;
  /** Ruta del índice de búsqueda del libro. */
  search: string;
  chapters: ManifestChapter[];
  glossary: PublishedGlossaryTerm[];
  questions: PublishedQuestion[];
  checklists: PublishedChecklist[];
}

/** Un documento por bloque de nivel superior; la UI construye el índice MiniSearch al vuelo. */
export interface SearchDocument {
  /** Id del bloque (único dentro del libro). */
  id: string;
  chapterId: string;
  section: string | null;
  kind: string;
  text: string;
}

export function bookBasePath(slug: string): string {
  return `${BOOKS_BASE_PATH}/${slug}`;
}

export function manifestPath(slug: string): string {
  return `${bookBasePath(slug)}/manifest.json`;
}

export function chapterPath(slug: string, chapterId: string): string {
  return `${bookBasePath(slug)}/${chapterId}.html`;
}

export function searchPath(slug: string): string {
  return `${bookBasePath(slug)}/search.json`;
}

export const CATALOG_PATH = `${BOOKS_BASE_PATH}/index.json`;
