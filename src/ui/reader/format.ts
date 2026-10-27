/** Textos de posición que muestra el chrome (funciones puras, sin React). */

import type { ManifestChapter } from '../../core/domain/published';
import type { ReaderPosition } from '../../reader-engine/types';

export function chapterShort(chapter: Pick<ManifestChapter, 'number' | 'label'>): string {
  return chapter.number !== null ? `Cap. ${chapter.number}` : chapter.label;
}

function shortFromPosition(position: ReaderPosition): string {
  const match = /(\d+)/.exec(position.chapterLabel);
  return match ? `Cap. ${match[1]}` : position.chapterLabel;
}

/** "259 de 1420" cuando ya hay páginas globales; si no, "Cap. 5 · pág. 3 de 12". */
export function pageLabel(position: ReaderPosition | null): string {
  if (!position) return '';
  if (position.mode === 'scroll') {
    return `${shortFromPosition(position)} · ${Math.round(position.percent * 100)} %`;
  }
  if (position.globalPage !== null && position.totalPages !== null) {
    return `${position.globalPage + 1} de ${position.totalPages}`;
  }
  if (position.pageInChapter !== null && position.pagesInChapter !== null) {
    return `${shortFromPosition(position)} · pág. ${position.pageInChapter + 1} de ${position.pagesInChapter}`;
  }
  return shortFromPosition(position);
}

/** Texto de la píldora para volver tras un salto. */
export function jumpLabel(position: ReaderPosition): string {
  if (position.globalPage !== null) return `pág. ${position.globalPage + 1}`;
  if (position.pageInChapter !== null)
    return `${shortFromPosition(position)} · pág. ${position.pageInChapter + 1}`;
  return `${shortFromPosition(position)} · ${Math.round(position.percent * 100)} %`;
}

export function percentLabel(percent: number): string {
  return `${Math.round(Math.min(1, Math.max(0, percent)) * 100)} %`;
}

/** Páginas que quedan en el capítulo ("Quedan 4 páginas en el capítulo"). */
export function pagesLeftInChapter(position: ReaderPosition | null): string | null {
  if (!position || position.pageInChapter === null || position.pagesInChapter === null) return null;
  const left = position.pagesInChapter - position.pageInChapter - 1;
  if (left <= 0) return 'Última página del capítulo';
  return left === 1 ? 'Queda 1 página en el capítulo' : `Quedan ${left} páginas en el capítulo`;
}
