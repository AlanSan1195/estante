import type { BookManifest } from '../core/domain/published';

export type ChapterFetcher = (href: string) => Promise<string>;

export const fetchChapterHtml: ChapterFetcher = async (href) => {
  const response = await fetch(href);
  if (!response.ok) throw new Error(`No se pudo cargar ${href} (${response.status})`);
  return response.text();
};

/** Carga los fragmentos HTML de los capítulos con caché en memoria (una petición por capítulo). */
export class ChapterStore {
  private readonly cache = new Map<string, Promise<string>>();
  private readonly ready = new Map<string, string>();

  constructor(
    private readonly manifest: BookManifest,
    private readonly fetcher: ChapterFetcher = fetchChapterHtml,
  ) {}

  get(chapterId: string): Promise<string> {
    const cached = this.cache.get(chapterId);
    if (cached) return cached;
    const chapter = this.manifest.chapters.find((c) => c.id === chapterId);
    if (!chapter) return Promise.reject(new Error(`Capítulo desconocido: ${chapterId}`));
    const promise = this.fetcher(chapter.href).then((html) => {
      this.ready.set(chapterId, html);
      return html;
    });
    promise.catch(() => this.cache.delete(chapterId));
    this.cache.set(chapterId, promise);
    return promise;
  }

  /** HTML si ya se descargó (sin esperar). */
  peek(chapterId: string): string | undefined {
    return this.ready.get(chapterId);
  }

  prefetch(chapterIds: readonly string[]): void {
    for (const id of chapterIds) this.get(id).catch(() => {});
  }
}
