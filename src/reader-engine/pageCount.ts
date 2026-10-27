/**
 * Números de página globales ("259 de 1420"). Medir los 24 capítulos de golpe bloquearía el hilo
 * principal, así que se mide uno por hueco libre (`requestIdleCallback`; Safari no lo tiene y se
 * usa `setTimeout`). El resultado se guarda por clave de layout: la próxima vez es instantáneo.
 */

import type { PageCountCache, PagesInfo } from './types';

export function chapterStarts(counts: readonly number[]): PagesInfo {
  const starts: number[] = [];
  let total = 0;
  for (const count of counts) {
    starts.push(total);
    total += Math.max(1, count);
  }
  return { total, chapterStarts: starts };
}

/** Capítulo y página dentro del capítulo para una página global. */
export function locateGlobalPage(
  info: PagesInfo,
  globalPage: number,
): { chapterIndex: number; page: number } {
  const page = Math.min(Math.max(0, Math.round(globalPage)), Math.max(0, info.total - 1));
  let chapterIndex = 0;
  for (let i = 0; i < info.chapterStarts.length; i++) {
    if ((info.chapterStarts[i] ?? 0) <= page) chapterIndex = i;
    else break;
  }
  return { chapterIndex, page: page - (info.chapterStarts[chapterIndex] ?? 0) };
}

type IdleHandle = { cancel(): void };

export function whenIdle(callback: () => void, timeout = 400): IdleHandle {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(callback, { timeout });
    return { cancel: () => w.cancelIdleCallback?.(handle) };
  }
  const handle = setTimeout(callback, 32);
  return { cancel: () => clearTimeout(handle) };
}

export interface PageCounterOptions {
  chapterIds: readonly string[];
  key: string;
  cache?: PageCountCache;
  /** Mide un capítulo y devuelve su número de páginas. */
  measure(chapterIndex: number): Promise<number>;
  onDone(counts: Record<string, number>): void;
}

export class PageCounter {
  private cancelled = false;
  private idle: IdleHandle | null = null;
  private readonly counts: Record<string, number> = {};

  constructor(private readonly options: PageCounterOptions) {}

  /** Conteos ya conocidos (de la caché o medidos al navegar). */
  known(chapterId: string, pages: number): void {
    this.counts[chapterId] = pages;
  }

  async start(): Promise<void> {
    const { cache, key, chapterIds } = this.options;
    const cached = cache ? await cache.get(key).catch(() => null) : null;
    if (this.cancelled) return;
    if (cached && chapterIds.every((id) => typeof cached[id] === 'number')) {
      Object.assign(this.counts, cached);
      this.options.onDone({ ...this.counts });
      return;
    }
    this.next(0);
  }

  private next(index: number): void {
    if (this.cancelled) return;
    const ids = this.options.chapterIds;
    if (index >= ids.length) {
      const result = { ...this.counts };
      this.options.cache?.set(this.options.key, result).catch(() => {});
      this.options.onDone(result);
      return;
    }
    const id = ids[index] as string;
    if (typeof this.counts[id] === 'number') {
      this.next(index + 1);
      return;
    }
    this.idle = whenIdle(() => {
      this.options
        .measure(index)
        .then((pages) => {
          this.counts[id] = pages;
        })
        .catch(() => {
          this.counts[id] = 1;
        })
        .finally(() => this.next(index + 1));
    });
  }

  cancel(): void {
    this.cancelled = true;
    this.idle?.cancel();
  }
}
