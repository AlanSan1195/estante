import { useEffect, useMemo, useRef, useState } from 'react';
import { filterGlossary, firstTermOccurrence } from '../../core/domain/glossary';
import type { ReaderEngine } from '../../reader-engine/engine';
import { SearchIcon } from '../glass/icons';
import { fetchChapterText } from '../services';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { jumpToBlock } from './navigation';
import { Sheet } from './Sheet';

/** Glosario del libro con búsqueda por término o alias. Tocar una entrada salta a su primera aparición. */
export function GlossarySheet({ engine }: { engine: ReaderEngine | null }) {
  const manifest = useReader((s) => s.manifest);
  const openSheet = useReader((s) => s.openSheet);
  const focus = useStudy((s) => s.glossaryFocus);
  const setFocus = useStudy((s) => s.setGlossaryFocus);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const focusRef = useRef<HTMLLIElement>(null);

  const terms = useMemo(
    () => (manifest ? filterGlossary(manifest.glossary, query) : []),
    [manifest, query],
  );

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  if (!manifest) return null;
  const close = () => {
    setFocus(null);
    openSheet(null);
  };

  const go = async (termId: string) => {
    const term = manifest.glossary.find((t) => t.id === termId);
    if (!term) return;
    setBusy(termId);
    const chapters = manifest.chapters;
    const found = await firstTermOccurrence(
      chapters.map((c) => c.id),
      (id) => fetchChapterText(chapters.find((c) => c.id === id)?.href ?? ''),
      termId,
    ).catch(() => null);
    setBusy(null);
    setFocus(null);
    const target = found ?? { chapterId: term.chapterId, blockId: term.blockId };
    jumpToBlock(engine, target.chapterId, target.blockId);
  };

  return (
    <Sheet
      title="Glosario"
      subtitle={`${manifest.glossary.length} términos`}
      testId="glossary-sheet"
      onClose={close}
    >
      <label className="rc-search-field">
        <SearchIcon />
        <input
          type="search"
          placeholder="Buscar término o alias"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar en el glosario"
          enterKeyHint="search"
        />
      </label>
      {terms.length === 0 ? (
        <p className="rc-empty">Ningún término coincide con “{query}”.</p>
      ) : (
        <ul className="rc-glossary">
          {terms.map((term) => {
            const aliases = term.aliases.filter((a) => a !== term.term);
            const focused = term.id === focus;
            return (
              <li key={term.id} ref={focused ? focusRef : undefined}>
                <button
                  type="button"
                  className={`rc-glossary-item${focused ? ' is-focused' : ''}`}
                  data-term-entry={term.id}
                  onClick={() => go(term.id)}
                  aria-busy={busy === term.id}
                >
                  <strong>{term.term}</strong>
                  {aliases.length > 1 ? <small>{aliases.join(' · ')}</small> : null}
                  <span>{term.definitionText}</span>
                  <em>{busy === term.id ? 'Buscando…' : 'Ver primera aparición'}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
