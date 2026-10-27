import type { Book } from '../domain/book';

/** Punto de extensión para enriquecer un libro (hoy no-op; mañana, explicaciones con IA). */
export interface ContentEnricher {
  enrich(book: Book): Promise<Book>;
}
