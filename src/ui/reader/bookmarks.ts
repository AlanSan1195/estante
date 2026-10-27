import type { ReaderEngine } from '../../reader-engine/engine';
import { useReader } from '../stores/readerStore';
import { createBookmarkId, useStudy } from '../stores/studyStore';

/** Marcadores que caen en la página visible. */
export function bookmarksOnPage(engine: ReaderEngine | null) {
  if (!engine) return [];
  return useStudy.getState().bookmarks.filter((b) => engine.pageContains(b.location));
}

/** Alterna el marcador de la página actual (como la cinta de Apple Books). */
export async function toggleBookmark(engine: ReaderEngine | null): Promise<void> {
  const position = engine?.position();
  const study = useStudy.getState();
  const reader = useReader.getState();
  if (!engine || !position || !study.slug) return;
  const existing = bookmarksOnPage(engine);
  if (existing.length > 0) {
    await Promise.all(existing.map((b) => study.removeBookmark(b.id)));
    reader.showToast('Marcador eliminado');
    return;
  }
  const block = engine
    .currentContainer()
    ?.querySelector(`[data-b="${CSS.escape(position.location.blockId)}"]`);
  const text = (block?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const label = text
    ? text.length > 120
      ? `${text.slice(0, 117).trimEnd()}…`
      : text
    : position.chapterTitle;
  await study.addBookmark({
    id: createBookmarkId(),
    bookSlug: study.slug,
    location: position.location,
    label,
    createdAt: Date.now(),
  });
  reader.showToast('Página marcada');
}
