import { useEffect, useMemo, useRef, useState } from 'react';
import { groupBy, makeSnippet } from '../../core/domain/search';
import type { ReaderEngine } from '../../reader-engine/engine';
import { SearchIcon } from '../glass/icons';
import { type SearchHit, searchBook } from '../search/searchIndex';
import { useReader } from '../stores/readerStore';
import { chapterShort } from './format';
import { jumpToBlock } from './navigation';
import { Sheet } from './Sheet';
import { Snippet } from './Snippet';

/** La última búsqueda se conserva al cerrar y reabrir la hoja (como Apple Books). */
let lastQuery = '';

/** Búsqueda dentro del libro: resultados agrupados por capítulo con el fragmento resaltado. */
export function SearchSheet({ engine }: { engine: ReaderEngine | null }) {
  const manifest = useReader((s) => s.manifest);
  const openSheet = useReader((s) => s.openSheet);
  const [query, setQuery] = useState(() => lastQuery);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!manifest) return;
    lastQuery = query;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchBook(manifest.slug, trimmed)
        .then((result) => {
          if (!cancelled) {
            setHits(result);
            setError(null);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, manifest]);

  const groups = useMemo(() => {
    if (!manifest || !hits) return [];
    const order = new Map(manifest.chapters.map((c, i) => [c.id, i]));
    const sorted = [...hits].sort(
      (a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0),
    );
    return groupBy(sorted, (hit) => hit.chapterId);
  }, [hits, manifest]);

  if (!manifest) return null;

  return (
    <Sheet title="Buscar en el libro" testId="search-sheet" onClose={() => openSheet(null)}>
      <label className="rc-search-field">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          placeholder={`Buscar en ${manifest.title}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar en el libro"
          enterKeyHint="search"
          data-testid="book-search-input"
        />
      </label>
      {error ? <p className="rc-empty">{error}</p> : null}
      {hits && hits.length === 0 ? (
        <p className="rc-empty">Sin resultados para “{query.trim()}”.</p>
      ) : null}
      {hits && hits.length > 0 ? (
        <p className="rc-result-count">
          {hits.length === 1 ? '1 resultado' : `${hits.length} resultados`}
        </p>
      ) : null}
      <div className="rc-results">
        {groups.map((group) => {
          const chapter = manifest.chapters.find((c) => c.id === group.key);
          return (
            <section key={group.key} className="rc-result-group">
              <h3>
                {chapter ? (
                  <>
                    <small>{chapterShort(chapter)}</small>
                    {chapter.title}
                  </>
                ) : (
                  group.key
                )}
              </h3>
              <ul>
                {group.items.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="rc-result"
                      data-testid="book-search-result"
                      onClick={() => jumpToBlock(engine, hit.chapterId, hit.id)}
                    >
                      {hit.section ? <small>{hit.section}</small> : null}
                      <span>
                        <Snippet parts={makeSnippet(hit.text, hit.terms)} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
