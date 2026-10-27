import {
  type Block,
  type Book,
  blockText,
  blockWords,
  collectGlossary,
  collectQuestions,
  inlineText,
  walkBlocks,
} from '../domain/book';
import {
  type BookManifest,
  type BookPalette,
  bookBasePath,
  type CatalogEntry,
  chapterPath,
  type ManifestChapter,
  PUBLISHED_FORMAT_VERSION,
  type PublishedChecklist,
  type SearchDocument,
  searchPath,
} from '../domain/published';
import type { BookRenderer } from '../ports/BookRenderer';
import type { PublishedBook } from '../ports/BookRepository';

export interface CoverAsset {
  fileName: string;
  content: string | Uint8Array;
  palette: BookPalette;
}

export function chapterLabel(number: number | null, title: string): string {
  return number !== null ? `Capítulo ${number}` : title;
}

/** Palabras desde el inicio del capítulo hasta cada bloque de nivel superior, y el total. */
export function chapterWordMap(blocks: readonly Block[]): {
  starts: Map<string, number>;
  total: number;
} {
  const starts = new Map<string, number>();
  let total = 0;
  for (const block of blocks) {
    starts.set(block.id, total);
    total += blockWords(block);
  }
  return { starts, total };
}

/** Construye todo lo que se publica de un libro: manifest, capítulos HTML, búsqueda y portada. */
export function publishBook(
  book: Book,
  sourceHash: string,
  renderer: BookRenderer,
  cover: CoverAsset,
): PublishedBook {
  const glossary = collectGlossary(book);
  const questions = collectQuestions(book);
  const chapters: ManifestChapter[] = [];
  const html: { id: string; html: string }[] = [];
  const search: SearchDocument[] = [];
  const checklists: PublishedChecklist[] = [];
  let wordStart = 0;

  for (const chapter of book.chapters) {
    const { starts, total } = chapterWordMap(chapter.blocks);
    const label = chapterLabel(chapter.number, chapter.title);
    html.push({
      id: chapter.id,
      html: renderer.renderChapter(chapter, {
        book,
        glossary,
        blockWordStart: starts,
        words: total,
        label,
      }),
    });
    chapters.push({
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      label,
      href: chapterPath(book.slug, chapter.id),
      wordStart,
      words: total,
      sections: chapter.sections.map((section) => ({
        id: section.id,
        title: section.title,
        number: section.number,
        blockId: section.blockId,
        wordStart: starts.get(section.blockId) ?? 0,
      })),
    });
    wordStart += total;

    let section: string | null = null;
    for (const block of chapter.blocks) {
      if (block.kind === 'heading' && block.sectionId) section = block.text;
      const text = blockText(block).trim();
      if (text)
        search.push({ id: block.id, chapterId: chapter.id, section, kind: block.kind, text });
    }
    walkBlocks(chapter.blocks, (block) => {
      if (block.kind !== 'checklist') return;
      checklists.push({
        blockId: block.id,
        chapterId: chapter.id,
        items: block.items.map((item) => ({ id: item.id, text: inlineText(item.content) })),
      });
    });
  }

  const manifest: BookManifest = {
    version: PUBLISHED_FORMAT_VERSION,
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    repo: book.repo,
    cover: `${bookBasePath(book.slug)}/${cover.fileName}`,
    palette: cover.palette,
    sourceHash,
    updatedAt: book.updatedAt,
    totalWords: wordStart,
    search: searchPath(book.slug),
    chapters,
    glossary: glossary.map((term) => ({
      id: term.id,
      term: term.term,
      aliases: term.aliases,
      definitionHtml: renderer.renderInlines(term.definition),
      definitionText: inlineText(term.definition),
      chapterId: term.chapterId,
      blockId: term.blockId,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      number: q.number,
      group: q.group,
      questionHtml: renderer.renderInlines(q.question),
      questionText: inlineText(q.question),
      answerHtml: renderer.renderInlines(q.answer),
      chapterId: q.chapterId,
      blockId: q.blockId,
    })),
    checklists,
  };

  return {
    manifest,
    chapters: html,
    search,
    cover: { fileName: cover.fileName, content: cover.content },
  };
}

export function catalogEntryFromManifest(manifest: BookManifest): CatalogEntry {
  return {
    slug: manifest.slug,
    title: manifest.title,
    subtitle: manifest.subtitle,
    author: manifest.author,
    cover: manifest.cover,
    palette: manifest.palette,
    chapters: manifest.chapters.length,
    totalWords: manifest.totalWords,
    questions: manifest.questions.length,
    terms: manifest.glossary.length,
    sourceHash: manifest.sourceHash,
    updatedAt: manifest.updatedAt,
  };
}
