import type { Book, Chapter, GlossaryTerm, Inline } from '../domain/book';

export interface ChapterRenderContext {
  book: Book;
  glossary: GlossaryTerm[];
  /** Palabras desde el inicio del capítulo hasta cada bloque de nivel superior. */
  blockWordStart: ReadonlyMap<string, number>;
  /** Palabras totales del capítulo. */
  words: number;
  /** Etiqueta visible del capítulo ("Capítulo 5" / "Introducción"). */
  label: string;
}

/** Convierte bloques del dominio en el formato visual publicado (HTML). */
export interface BookRenderer {
  renderChapter(chapter: Chapter, context: ChapterRenderContext): string;
  renderInlines(nodes: readonly Inline[]): string;
}
