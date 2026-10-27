import { useEffect, useMemo, useRef, useState } from 'react';
import { groupBy, makeSnippet } from '../../core/domain/search';
import { SearchIcon } from '../glass/icons';
import { readerHref } from '../library/useProgress';
import { Snippet } from '../reader/Snippet';
import { type SearchHit, searchLibrary } from './searchIndex';

export interface SearchBook {
  slug: string;
  title: string;
  chapters: { id: string; title: string; label: string }[];
}

/** Búsqueda en todos los libros del estante; los resultados abren el lector en ese bloque. */
export default function GlobalSearch({ books }: { books: SearchBook[] }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQuery(initial);
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchLibrary(
        books.map((b) => b.slug),
        trimmed,
      )
        .then((result) => {
          if (!cancelled) setHits(result);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, books]);

  const byBook = useMemo(() => {
    if (!hits) return [];
    return groupBy(hits, (hit) => hit.bookSlug).map((group) => {
      const book = books.find((b) => b.slug === group.key);
      const order = new Map(book?.chapters.map((c, i) => [c.id, i]) ?? []);
      const items = [...group.items].sort(
        (a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0),
      );
      return { book, chapters: groupBy(items, (hit) => hit.chapterId) };
    });
  }, [hits, books]);

  return (
    <>
      <form className="search-form" onSubmit={(event) => event.preventDefault()}>
        <label className="search-field glass">
          <SearchIcon />
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="Busca en todos tus libros"
            aria-label="Buscar en todos los libros"
            enterKeyHint="search"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            data-testid="global-search-input"
          />
        </label>
      </form>

      {hits === null ? (
        <p className="search-hint">
          {loading
            ? 'Buscando…'
            : 'Escribe una tecnología, un patrón o una decisión: “single-flight”, “Zustand”, “SSE”…'}
        </p>
      ) : hits.length === 0 ? (
        <p className="search-hint">Sin resultados para “{query.trim()}”.</p>
      ) : (
        <p className="search-count">
          {hits.length === 1 ? '1 resultado' : `${hits.length} resultados`}
        </p>
      )}

      {byBook.map(({ book, chapters }) =>
        book ? (
          <section key={book.slug} className="search-book">
            <h2>{book.title}</h2>
            {chapters.map((group) => {
              const chapter = book.chapters.find((c) => c.id === group.key);
              return (
                <div key={group.key} className="search-chapter">
                  <h3>
                    {chapter && chapter.label !== chapter.title ? (
                      <small>{chapter.label}</small>
                    ) : null}
                    {chapter?.title ?? group.key}
                  </h3>
                  <ul>
                    {group.items.map((hit) => (
                      <li key={hit.id}>
                        <a
                          className="search-result"
                          href={readerHref(book.slug, hit.id)}
                          data-testid="global-search-result"
                        >
                          {hit.section ? <small>{hit.section}</small> : null}
                          <span>
                            <Snippet parts={makeSnippet(hit.text, hit.terms)} />
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ) : null,
      )}
    </>
  );
}
