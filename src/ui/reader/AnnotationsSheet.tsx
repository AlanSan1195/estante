import { useMemo, useState } from 'react';
import type { ReaderEngine } from '../../reader-engine/engine';
import { BookmarkIcon, TrashIcon } from '../glass/icons';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { jumpTo } from './navigation';
import { locationLabel, readingOrderKey } from './positions';
import { Sheet } from './Sheet';

type Tab = 'bookmarks' | 'highlights';

const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

/** Marcadores y subrayados del libro, en orden de lectura. Tocar salta; el botón borra. */
export function AnnotationsSheet({ engine }: { engine: ReaderEngine | null }) {
  const manifest = useReader((s) => s.manifest);
  const openSheet = useReader((s) => s.openSheet);
  const bookmarks = useStudy((s) => s.bookmarks);
  const highlights = useStudy((s) => s.highlights);
  const removeBookmark = useStudy((s) => s.removeBookmark);
  const removeHighlight = useStudy((s) => s.removeHighlight);
  const setNoteFor = useStudy((s) => s.setNoteFor);
  const [tab, setTab] = useState<Tab>(() =>
    bookmarks.length === 0 && highlights.length > 0 ? 'highlights' : 'bookmarks',
  );

  const sortedBookmarks = useMemo(() => {
    if (!manifest) return [];
    return [...bookmarks].sort(
      (a, b) =>
        readingOrderKey(manifest, a.location.chapterId, a.location.blockId, a.location.charOffset) -
        readingOrderKey(manifest, b.location.chapterId, b.location.blockId, b.location.charOffset),
    );
  }, [bookmarks, manifest]);

  const sortedHighlights = useMemo(() => {
    if (!manifest) return [];
    return [...highlights].sort(
      (a, b) =>
        readingOrderKey(manifest, a.chapterId, a.blockId, a.start) -
        readingOrderKey(manifest, b.chapterId, b.blockId, b.start),
    );
  }, [highlights, manifest]);

  if (!manifest) return null;
  const total = bookmarks.length + highlights.length;

  return (
    <Sheet
      title="Marcadores y subrayados"
      subtitle={total === 1 ? '1 anotación' : `${total} anotaciones`}
      testId="annotations-sheet"
      onClose={() => openSheet(null)}
    >
      <fieldset className="rc-segmented rc-tabs">
        <legend className="visually-hidden">Tipo de anotación</legend>
        <button
          type="button"
          aria-pressed={tab === 'bookmarks'}
          onClick={() => setTab('bookmarks')}
          data-testid="tab-bookmarks"
        >
          Marcadores · {bookmarks.length}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'highlights'}
          onClick={() => setTab('highlights')}
          data-testid="tab-highlights"
        >
          Subrayados · {highlights.length}
        </button>
      </fieldset>

      {tab === 'bookmarks' ? (
        sortedBookmarks.length === 0 ? (
          <p className="rc-empty">
            Toca <BookmarkIcon className="rc-inline-icon" /> en el menú para marcar la página
            actual.
          </p>
        ) : (
          <ul className="rc-notes" data-testid="bookmark-list">
            {sortedBookmarks.map((bookmark) => (
              <li key={bookmark.id} className="rc-note">
                <button
                  type="button"
                  className="rc-note-main"
                  onClick={() => jumpTo(engine, bookmark.location)}
                >
                  <small>
                    {locationLabel(
                      manifest,
                      bookmark.location.chapterId,
                      bookmark.location.blockId,
                    )}
                  </small>
                  <span>{bookmark.label}</span>
                  <em>{DATE.format(bookmark.createdAt)}</em>
                </button>
                <button
                  type="button"
                  className="rc-note-delete"
                  aria-label="Borrar marcador"
                  onClick={() => removeBookmark(bookmark.id).catch(() => {})}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : sortedHighlights.length === 0 ? (
        <p className="rc-empty">Mantén pulsado el texto y elige un color para subrayar.</p>
      ) : (
        <ul className="rc-notes" data-testid="highlight-list">
          {sortedHighlights.map((highlight) => (
            <li key={highlight.id} className="rc-note" data-color={highlight.color}>
              <button
                type="button"
                className="rc-note-main"
                onClick={() =>
                  jumpTo(engine, {
                    chapterId: highlight.chapterId,
                    blockId: highlight.blockId,
                    charOffset: highlight.start,
                  })
                }
              >
                <small>{locationLabel(manifest, highlight.chapterId, highlight.blockId)}</small>
                <q>{highlight.quote}</q>
                {highlight.note ? <span className="rc-note-text">{highlight.note}</span> : null}
              </button>
              <div className="rc-note-actions">
                <button
                  type="button"
                  className="rc-note-delete"
                  aria-label={highlight.note ? 'Editar nota' : 'Añadir nota'}
                  onClick={() => {
                    setNoteFor(highlight.id);
                    openSheet('note');
                  }}
                >
                  <span aria-hidden="true">✎</span>
                </button>
                <button
                  type="button"
                  className="rc-note-delete"
                  aria-label="Borrar subrayado"
                  onClick={() => removeHighlight(highlight.id).catch(() => {})}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
