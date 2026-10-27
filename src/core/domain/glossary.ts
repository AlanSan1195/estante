/**
 * Glosario en la interfaz (funciones puras): filtrar por término o alias y encontrar la primera
 * aparición marcada de un término en el HTML publicado de los capítulos.
 */

import { normalizeForSearch } from './search';

export interface GlossaryEntryLike {
  id: string;
  term: string;
  aliases: readonly string[];
  definitionText: string;
}

/** Términos que coinciden con la consulta (término, alias o definición), sin acentos. */
export function filterGlossary<T extends GlossaryEntryLike>(
  terms: readonly T[],
  query: string,
): T[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [...terms];
  const scored: { term: T; score: number }[] = [];
  for (const term of terms) {
    const names = [term.term, ...term.aliases].map(normalizeForSearch);
    let score = 0;
    if (names.some((n) => n === q)) score = 4;
    else if (names.some((n) => n.startsWith(q))) score = 3;
    else if (names.some((n) => n.includes(q))) score = 2;
    else if (normalizeForSearch(term.definitionText).includes(q)) score = 1;
    if (score > 0) scored.push({ term, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.term);
}

export interface BlockRef {
  chapterId: string;
  blockId: string;
}

/**
 * Bloque que contiene la marca `data-term="<id>"` dentro de un fragmento de capítulo. Los bloques
 * de nivel superior son los únicos con `data-b` y van en orden, así que el `data-b` más cercano
 * antes de la marca es el bloque que la contiene.
 */
export function termBlockInHtml(html: string, termId: string): string | null {
  const marker = html.indexOf(`data-term="${termId}"`);
  if (marker === -1) return null;
  const before = html.slice(0, marker);
  const index = before.lastIndexOf(' data-b="');
  if (index === -1) return null;
  const start = index + ' data-b="'.length;
  const end = before.indexOf('"', start);
  return end === -1 ? null : before.slice(start, end);
}

/** Primera aparición de un término recorriendo capítulos en orden (se detiene en la primera). */
export async function firstTermOccurrence(
  chapterIds: readonly string[],
  loadHtml: (chapterId: string) => Promise<string>,
  termId: string,
): Promise<BlockRef | null> {
  for (const chapterId of chapterIds) {
    const html = await loadHtml(chapterId);
    const blockId = termBlockInHtml(html, termId);
    if (blockId) return { chapterId, blockId };
  }
  return null;
}
