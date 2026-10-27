import type { Book } from '../domain/book';
import type { BuildWarning } from '../domain/warnings';
import type { SourceDocument } from './ProjectSource';

export interface ParseResult {
  book: Book;
  warnings: BuildWarning[];
}

/** Convierte un documento fuente en un libro de dominio (bloques, no HTML). */
export interface DocumentParser {
  parse(source: SourceDocument): ParseResult;
}
