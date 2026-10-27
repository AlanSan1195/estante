/**
 * Biblioteca (funciones puras): estado de cada libro, orden del estante y qué mostrar en Inicio.
 */

import { formatPercent, type ReadingProgress } from './location';

export type SortMode = 'recent' | 'title' | 'progress';

export const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Recientes',
  title: 'Título',
  progress: 'Progreso',
};

export interface ShelfBook {
  slug: string;
  title: string;
  updatedAt: string;
}

export type BookState = 'new' | 'reading' | 'finished';

export function bookState(progress: ReadingProgress | null | undefined): BookState {
  if (!progress) return 'new';
  return progress.finished ? 'finished' : 'reading';
}

/** "Nuevo", "Empezado", "7 %" o "Terminado", como en el estante de Apple Books. */
export function bookStatusLabel(progress: ReadingProgress | null | undefined): string {
  const state = bookState(progress);
  if (state === 'finished') return 'Terminado';
  if (state === 'new' || !progress) return 'Nuevo';
  // Abierto pero sin avanzar ni un 1 %: "0 %" parece un error.
  if (progress.percent < 0.01) return 'Empezado';
  return formatPercent(progress.percent);
}

/**
 * Orden del estante:
 * - recientes: el último abierto primero; los nunca abiertos al final, por fecha del MD.
 * - título: alfabético en español.
 * - progreso: en lectura (más avanzado primero), después nuevos y al final terminados.
 */
export function sortShelf<T extends ShelfBook>(
  books: readonly T[],
  progress: ReadonlyMap<string, ReadingProgress>,
  mode: SortMode,
): T[] {
  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
  const list = [...books];
  if (mode === 'title') return list.sort((a, b) => collator.compare(a.title, b.title));
  if (mode === 'progress') {
    const rank = (book: T) => {
      const state = bookState(progress.get(book.slug));
      return state === 'reading' ? 0 : state === 'new' ? 1 : 2;
    };
    return list.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (progress.get(b.slug)?.percent ?? 0) - (progress.get(a.slug)?.percent ?? 0) ||
        collator.compare(a.title, b.title),
    );
  }
  return list.sort((a, b) => {
    const pa = progress.get(a.slug)?.updatedAt ?? null;
    const pb = progress.get(b.slug)?.updatedAt ?? null;
    if (pa !== null && pb !== null) return pb - pa;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return b.updatedAt.localeCompare(a.updatedAt) || collator.compare(a.title, b.title);
  });
}

export interface HomeSelection<T> {
  /** Libro en curso más reciente (sin terminar). */
  current: T | null;
  /** Otros libros abiertos recientemente (sin el actual), del más reciente al más antiguo. */
  recent: T[];
  /** Libros que nunca se abrieron. */
  unopened: T[];
}

export function homeSelection<T extends ShelfBook>(
  books: readonly T[],
  progress: ReadonlyMap<string, ReadingProgress>,
  recentLimit = 6,
): HomeSelection<T> {
  const opened = books
    .filter((b) => progress.has(b.slug))
    .sort(
      (a, b) => (progress.get(b.slug)?.updatedAt ?? 0) - (progress.get(a.slug)?.updatedAt ?? 0),
    );
  const current = opened.find((b) => !progress.get(b.slug)?.finished) ?? null;
  return {
    current,
    recent: opened.filter((b) => b !== current).slice(0, recentLimit),
    unopened: books.filter((b) => !progress.has(b.slug)),
  };
}

export function countLabel(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString('es')} ${n === 1 ? singular : plural}`;
}
