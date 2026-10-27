/**
 * Una ubicación de lectura nunca es un número de página: las páginas cambian con el tamaño de
 * letra o el ancho de pantalla. Se ancla a un bloque estable y a un desplazamiento dentro de él.
 */
export interface Location {
  chapterId: string;
  blockId: string;
  /** Desplazamiento en caracteres dentro del texto del bloque (0 = inicio del bloque). */
  charOffset: number;
}

export interface ReadingProgress {
  bookSlug: string;
  location: Location;
  /** 0…1, calculado con palabras acumuladas. */
  percent: number;
  updatedAt: number;
  finished: boolean;
}

/** Porcentaje leído a partir de un desplazamiento en palabras sobre el total del libro. */
export function percentFromWordOffset(wordOffset: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.min(1, Math.max(0, wordOffset / totalWords));
}

/**
 * Desplazamiento global en palabras de una ubicación:
 * inicio del capítulo + inicio del bloque dentro del capítulo + fracción del bloque.
 */
export function wordOffsetOf(
  chapterWordStart: number,
  blockWordStart: number,
  blockWords: number,
  charOffset: number,
  blockChars: number,
): number {
  const fraction = blockChars > 0 ? Math.min(1, Math.max(0, charOffset / blockChars)) : 0;
  return chapterWordStart + blockWordStart + fraction * blockWords;
}

/** Formatea un porcentaje como lo muestra la biblioteca ("7 %"). */
export function formatPercent(percent: number): string {
  return `${Math.round(Math.min(1, Math.max(0, percent)) * 100)} %`;
}

/** Se considera terminado al llegar al 99 % o al marcarlo a mano. */
export function isFinishedPercent(percent: number): boolean {
  return percent >= 0.99;
}

export function sameLocation(a: Location, b: Location): boolean {
  return a.chapterId === b.chapterId && a.blockId === b.blockId && a.charOffset === b.charOffset;
}
