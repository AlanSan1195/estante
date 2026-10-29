import {
  type Book,
  blockInlines,
  collectGlossary,
  collectQuestions,
  walkBlocks,
  walkInlines,
} from '../domain/book';
import { type BuildWarning, warning } from '../domain/warnings';

/** Comprobaciones de estructura que no dependen de adaptadores. */
export function validateBook(book: Book): BuildWarning[] {
  const warnings: BuildWarning[] = [];
  const slug = book.slug;

  if (book.chapters.length === 0) {
    warnings.push(warning('empty-book', slug, 'El documento no produjo ningún capítulo.'));
    return warnings;
  }

  // Índice escrito a mano frente a capítulos reales.
  if (book.toc.length > 0) {
    for (const entry of book.toc) {
      if (!entry.target) {
        warnings.push(
          warning(
            'toc-unresolved',
            slug,
            `El índice enlaza a "#${entry.slug}" (${entry.label}), que no existe.`,
          ),
        );
      }
    }
    const linked = new Set(book.toc.map((entry) => entry.target?.chapterId).filter(Boolean));
    for (const chapter of book.chapters) {
      if (chapter.number !== null && !linked.has(chapter.id)) {
        warnings.push(
          warning(
            'toc-missing-chapter',
            slug,
            `El capítulo ${chapter.number} "${chapter.title}" no aparece en el índice del MD.`,
          ),
        );
      }
    }
  }

  // Numeración consecutiva de capítulos.
  const numbers = book.chapters.map((c) => c.number).filter((n): n is number => n !== null);
  numbers.forEach((n, i) => {
    const expected = (numbers[0] ?? 1) + i;
    if (n !== expected) {
      warnings.push(
        warning(
          'chapter-numbering',
          slug,
          `Se esperaba el capítulo ${expected} y aparece el ${n}.`,
        ),
      );
    }
  });

  // Anclas internas del cuerpo que no resuelven.
  for (const chapter of book.chapters) {
    walkBlocks(chapter.blocks, (block) => {
      for (const inlines of blockInlines(block)) {
        walkInlines(inlines, (node) => {
          if (node.type === 'anchor' && !node.target) {
            warnings.push(
              warning(
                'anchor-unresolved',
                slug,
                `Ancla "#${node.slug}" sin destino (capítulo "${chapter.title}").`,
              ),
            );
          }
        });
      }
    });
  }

  // Funciones de estudio que el libro no aprovecha (ver docs/formato-libro.md).
  if (collectQuestions(book).length === 0) {
    warnings.push(
      warning(
        'no-questions',
        slug,
        'Sin banco de preguntas (**N. ¿…?** respuesta): Práctica no tendrá tarjetas de este libro.',
      ),
    );
  }
  if (collectGlossary(book).length === 0) {
    warnings.push(
      warning(
        'no-glossary',
        slug,
        'Sin glosario (tabla bajo un encabezado "Glosario"): los términos no tendrán definición al tocarlos.',
      ),
    );
  }

  return warnings;
}
