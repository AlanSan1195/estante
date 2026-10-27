import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type BookManifest,
  type LibraryCatalog,
  PUBLISHED_FORMAT_VERSION,
} from '../core/domain/published';

const BOOKS_DIR = join(process.cwd(), 'public', 'books');

/** Lee en build el catálogo que la integración acaba de escribir en `public/books/index.json`. */
export async function readCatalog(): Promise<LibraryCatalog> {
  try {
    return JSON.parse(await readFile(join(BOOKS_DIR, 'index.json'), 'utf8')) as LibraryCatalog;
  } catch {
    return { version: PUBLISHED_FORMAT_VERSION, books: [] };
  }
}

/** Manifest de un libro ya publicado (para páginas que necesitan capítulos o preguntas en build). */
export async function readManifest(slug: string): Promise<BookManifest> {
  return JSON.parse(await readFile(join(BOOKS_DIR, slug, 'manifest.json'), 'utf8')) as BookManifest;
}

/** Todos los manifests del catálogo, en el orden del catálogo. */
export async function readAllManifests(): Promise<BookManifest[]> {
  const catalog = await readCatalog();
  return Promise.all(catalog.books.map((book) => readManifest(book.slug)));
}
