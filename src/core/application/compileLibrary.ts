import { type Book, type BookStats, bookStats, mapBookBlocks } from '../domain/book';
import { type LibraryCatalog, PUBLISHED_FORMAT_VERSION } from '../domain/published';
import { bytesHash, contentHash } from '../domain/text';
import { type BuildWarning, warning } from '../domain/warnings';
import type { BookRenderer } from '../ports/BookRenderer';
import type { BookRepository } from '../ports/BookRepository';
import type { CodeHighlighter } from '../ports/CodeHighlighter';
import type { ContentEnricher } from '../ports/ContentEnricher';
import type { CoverGenerator } from '../ports/CoverGenerator';
import type { DiagramRenderer } from '../ports/DiagramRenderer';
import type { DocumentParser } from '../ports/DocumentParser';
import type { ProjectSource, SourceDocument } from '../ports/ProjectSource';
import { type CoverAsset, catalogEntryFromManifest, publishBook } from './publishBook';
import { validateBook } from './validateBook';

/** Cambiar este valor obliga a regenerar todos los libros aunque su MD no cambie. */
export const PIPELINE_VERSION = 'estante-pipeline-1';

export interface CompileDependencies {
  source: ProjectSource;
  parser: DocumentParser;
  enricher: ContentEnricher;
  highlighter: CodeHighlighter;
  diagrams: DiagramRenderer;
  covers: CoverGenerator;
  renderer: BookRenderer;
  repository: BookRepository;
}

export interface CompileOptions {
  /** Recompila aunque el hash no haya cambiado. */
  force?: boolean;
  /** Solo compila en memoria (no escribe nada). */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface CompiledBookReport {
  slug: string;
  title: string;
  skipped: boolean;
  stats: BookStats | null;
  warnings: BuildWarning[];
}

export interface CompileReport {
  books: CompiledBookReport[];
  warnings: BuildWarning[];
  pruned: string[];
  catalog: LibraryCatalog;
}

export function sourceHashOf(source: SourceDocument): string {
  const coverHash = source.cover ? bytesHash(source.cover.bytes) : 'none';
  return contentHash(`${PIPELINE_VERSION}\n${coverHash}\n${source.markdown}`);
}

/** Caso de uso principal: carpeta de MD → biblioteca publicada. */
export async function compileLibrary(
  deps: CompileDependencies,
  options: CompileOptions = {},
): Promise<CompileReport> {
  const log = options.log ?? (() => {});
  const sources = await deps.source.list();
  const reports: CompiledBookReport[] = [];
  const globalWarnings: BuildWarning[] = [];
  const catalog: LibraryCatalog = { version: PUBLISHED_FORMAT_VERSION, books: [] };
  const seenSlugs = new Set<string>();

  try {
    for (const source of sources) {
      if (seenSlugs.has(source.slug)) {
        globalWarnings.push(
          warning(
            'duplicate-slug',
            source.slug,
            `"${source.fileName}" produce un slug repetido y se ignora.`,
          ),
        );
        continue;
      }
      seenSlugs.add(source.slug);

      const hash = sourceHashOf(source);
      if (!options.force && !options.dryRun) {
        const existing = await deps.repository.readManifest(source.slug);
        if (existing && existing.sourceHash === hash) {
          catalog.books.push(catalogEntryFromManifest(existing));
          reports.push({
            slug: source.slug,
            title: existing.title,
            skipped: true,
            stats: null,
            warnings: [],
          });
          log(`${source.slug}: sin cambios`);
          continue;
        }
      }

      const report = await compileOne(source, hash, deps, options);
      catalog.books.push(report.entry);
      reports.push(report.report);
      log(`${source.slug}: compilado (${report.report.stats?.chapters ?? 0} capítulos)`);
    }
  } finally {
    await deps.diagrams.dispose?.();
  }

  const titles = new Map<string, string>();
  for (const entry of catalog.books) {
    const key = entry.title.toLowerCase();
    const other = titles.get(key);
    if (other) {
      globalWarnings.push(
        warning(
          'duplicate-title',
          entry.slug,
          `"${entry.title}" se repite en ${other} y ${entry.slug}.`,
        ),
      );
    } else {
      titles.set(key, entry.slug);
    }
  }

  catalog.books.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  let pruned: string[] = [];
  if (!options.dryRun) {
    pruned = await deps.repository.prune(catalog.books.map((b) => b.slug));
    await deps.repository.saveCatalog(catalog);
  }

  const warnings = [...reports.flatMap((r) => r.warnings), ...globalWarnings];
  return { books: reports, warnings, pruned, catalog };
}

async function compileOne(
  source: SourceDocument,
  hash: string,
  deps: CompileDependencies,
  options: CompileOptions,
) {
  const parsed = deps.parser.parse(source);
  const warnings = [...parsed.warnings];
  let book: Book = await deps.enricher.enrich(parsed.book);

  book = await mapBookBlocks(book, async (block) => {
    if (block.kind === 'code') {
      if (!deps.highlighter.supports(block.lang)) {
        warnings.push(
          warning(
            'code-language-unknown',
            book.slug,
            `Lenguaje "${block.lang}" sin resaltado (bloque ${block.id}).`,
          ),
        );
        return { ...block, html: await deps.highlighter.highlight(block.code, 'text') };
      }
      return { ...block, html: await deps.highlighter.highlight(block.code, block.lang) };
    }
    if (block.kind === 'diagram') {
      try {
        return { ...block, svg: await deps.diagrams.render(block.source, block.lang) };
      } catch (error) {
        warnings.push(
          warning(
            'diagram-failed',
            book.slug,
            `Diagrama ${block.id} sin renderizar: ${String(error)}`,
          ),
        );
        const lang = deps.highlighter.supports('mermaid') ? 'mermaid' : 'text';
        return {
          kind: 'code',
          id: block.id,
          lang: 'mermaid',
          code: block.source,
          html: await deps.highlighter.highlight(block.source, lang),
        };
      }
    }
    return block;
  });

  warnings.push(...validateBook(book));

  const coverInput = {
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    color: book.color,
  };
  let cover: CoverAsset;
  if (source.cover) {
    cover = {
      fileName: `cover.${source.cover.extension}`,
      content: source.cover.bytes,
      palette: deps.covers.palette(coverInput),
    };
  } else {
    const generated = deps.covers.generate(coverInput);
    cover = { fileName: 'cover.svg', content: generated.svg, palette: generated.palette };
  }

  const published = publishBook(book, hash, deps.renderer, cover);
  if (!options.dryRun) await deps.repository.saveBook(published);

  return {
    entry: catalogEntryFromManifest(published.manifest),
    report: {
      slug: book.slug,
      title: book.title,
      skipped: false,
      stats: bookStats(book),
      warnings,
    } satisfies CompiledBookReport,
  };
}
