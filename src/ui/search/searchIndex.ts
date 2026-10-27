/**
 * Índices MiniSearch construidos en el navegador a partir de `search.json` (un documento por
 * bloque). Se normalizan los términos sin acentos para que "hidratacion" encuentre "Hidratación".
 */

import MiniSearch from 'minisearch';
import type { SearchDocument } from '../../core/domain/published';
import { normalizeForSearch } from '../../core/domain/search';
import { fetchSearchDocuments } from '../services';

export interface SearchHit {
  bookSlug: string;
  /** Id del bloque. */
  id: string;
  chapterId: string;
  section: string | null;
  kind: string;
  text: string;
  /** Términos del índice que coincidieron (normalizados). */
  terms: string[];
  score: number;
}

type IndexedDocument = SearchDocument;

const indexes = new Map<string, Promise<MiniSearch<IndexedDocument>>>();

function createIndex(documents: SearchDocument[]): MiniSearch<IndexedDocument> {
  const index = new MiniSearch<IndexedDocument>({
    fields: ['text', 'section'],
    storeFields: ['chapterId', 'section', 'kind', 'text'],
    processTerm: (term) => {
      const normalized = normalizeForSearch(term);
      return normalized.length > 1 ? normalized : null;
    },
    searchOptions: {
      prefix: (term) => term.length > 2,
      fuzzy: (term) => (term.length > 5 ? 0.15 : false),
      combineWith: 'AND',
      boost: { section: 1.5 },
    },
  });
  index.addAll(documents);
  return index;
}

/** Índice del libro (se construye una vez por sesión). */
export function bookIndex(slug: string): Promise<MiniSearch<IndexedDocument>> {
  let pending = indexes.get(slug);
  if (!pending) {
    pending = fetchSearchDocuments(slug).then(createIndex);
    pending.catch(() => indexes.delete(slug));
    indexes.set(slug, pending);
  }
  return pending;
}

export async function searchBook(slug: string, query: string, limit = 60): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const index = await bookIndex(slug);
  return index
    .search(trimmed)
    .slice(0, limit)
    .map((result) => ({
      bookSlug: slug,
      id: String(result.id),
      chapterId: String(result.chapterId),
      section: (result.section as string | null) ?? null,
      kind: String(result.kind),
      text: String(result.text),
      terms: result.terms,
      score: result.score,
    }));
}

/** Busca en varios libros y mezcla los resultados por puntuación. */
export async function searchLibrary(
  slugs: readonly string[],
  query: string,
  limitPerBook = 40,
): Promise<SearchHit[]> {
  const lists = await Promise.all(
    slugs.map((slug) => searchBook(slug, query, limitPerBook).catch(() => [] as SearchHit[])),
  );
  return lists.flat().sort((a, b) => b.score - a.score);
}
