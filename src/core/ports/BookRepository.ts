import type { BookManifest, LibraryCatalog, SearchDocument } from '../domain/published';

export interface PublishedBook {
  manifest: BookManifest;
  chapters: { id: string; html: string }[];
  search: SearchDocument[];
  cover: { fileName: string; content: string | Uint8Array };
}

/** Puerto de salida: dónde se publican los libros compilados. */
export interface BookRepository {
  readManifest(slug: string): Promise<BookManifest | null>;
  saveBook(book: PublishedBook): Promise<void>;
  saveCatalog(catalog: LibraryCatalog): Promise<void>;
  /** Elimina libros publicados cuyo MD ya no existe. */
  prune(keepSlugs: readonly string[]): Promise<string[]>;
}
