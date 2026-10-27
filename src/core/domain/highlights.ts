/**
 * Anclaje de subrayados (funciones puras). Un subrayado guarda el bloque, los offsets dentro del
 * texto del bloque y la cita textual. Si el MD cambia y los offsets ya no apuntan a la cita, se
 * reancla buscando la cita en el bloque (la aparición más cercana a la posición original).
 */

import type { Highlight, HighlightColor } from './annotations';

/** Colores que ofrece la barra de subrayado (el quinto del tipo queda para compatibilidad). */
export const HIGHLIGHT_COLORS = [
  'yellow',
  'green',
  'blue',
  'pink',
] as const satisfies readonly HighlightColor[];

export interface TextRange {
  start: number;
  end: number;
}

/** Cita normalizada para comparar (espacios colapsados). */
export function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Devuelve los offsets donde pintar el subrayado dentro del texto actual del bloque, o null si la
 * cita ya no existe (subrayado huérfano: se lista pero no se pinta).
 */
export function resolveHighlight(
  blockText: string,
  highlight: Pick<Highlight, 'start' | 'end' | 'quote'>,
): TextRange | null {
  const { start, end, quote } = highlight;
  if (!quote) return null;
  if (start >= 0 && end <= blockText.length && start < end) {
    if (normalizeQuote(blockText.slice(start, end)) === normalizeQuote(quote))
      return { start, end };
  }
  const occurrences: number[] = [];
  let from = blockText.indexOf(quote);
  while (from !== -1) {
    occurrences.push(from);
    from = blockText.indexOf(quote, from + 1);
  }
  if (occurrences.length === 0) return null;
  let best = occurrences[0] ?? 0;
  for (const candidate of occurrences) {
    if (Math.abs(candidate - start) < Math.abs(best - start)) best = candidate;
  }
  return { start: best, end: best + quote.length };
}

export interface Segment {
  /** Índice del trozo de texto (nodo de texto en el DOM). */
  index: number;
  /** Rango dentro de ese trozo. */
  from: number;
  to: number;
}

/**
 * Reparte un rango [start, end) sobre trozos de texto consecutivos de longitudes dadas.
 * La parte DOM solo tiene que envolver `[from, to)` de cada nodo indicado.
 */
export function rangeSegments(lengths: readonly number[], start: number, end: number): Segment[] {
  const segments: Segment[] = [];
  if (end <= start) return segments;
  let offset = 0;
  lengths.forEach((length, index) => {
    const nodeStart = offset;
    const nodeEnd = offset + length;
    offset = nodeEnd;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (to > from) segments.push({ index, from: from - nodeStart, to: to - nodeStart });
  });
  return segments;
}

/** ¿Se solapan dos rangos? (para saber si una selección toca un subrayado existente). */
export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Recorta y valida un rango de selección dentro de un bloque de `length` caracteres. */
export function clampRange(range: TextRange, length: number): TextRange | null {
  const start = Math.max(0, Math.min(range.start, length));
  const end = Math.max(0, Math.min(range.end, length));
  if (end <= start) return null;
  return { start, end };
}

/**
 * Ajusta un rango para que no empiece ni termine en espacios (la selección de iOS suele incluir el
 * espacio final de una palabra).
 */
export function trimRange(text: string, range: TextRange): TextRange | null {
  let { start, end } = range;
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  return end > start ? { start, end } : null;
}

/** Ordena subrayados por posición de lectura (capítulo en orden del libro, bloque y offset). */
export function sortHighlights<T extends Pick<Highlight, 'chapterId' | 'blockId' | 'start'>>(
  highlights: readonly T[],
  chapterOrder: readonly string[],
  blockOrder: (blockId: string) => number = blockIndexFromId,
): T[] {
  const chapterIndex = new Map(chapterOrder.map((id, index) => [id, index]));
  return [...highlights].sort(
    (a, b) =>
      (chapterIndex.get(a.chapterId) ?? 1e9) - (chapterIndex.get(b.chapterId) ?? 1e9) ||
      blockOrder(a.blockId) - blockOrder(b.blockId) ||
      a.start - b.start,
  );
}

/**
 * Orden aproximado de un bloque a partir de su id `<capítulo>.<sección>.<n>`: no conoce el orden de
 * las secciones, así que solo sirve como desempate dentro de una misma sección.
 */
export function blockIndexFromId(blockId: string): number {
  const last = blockId.split('.').at(-1) ?? '';
  const n = Number(last);
  return Number.isFinite(n) ? n : -1;
}
