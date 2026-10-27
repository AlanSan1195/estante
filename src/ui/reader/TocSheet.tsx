import { useEffect, useRef, useState } from 'react';
import type { ReaderEngine } from '../../reader-engine/engine';
import { ChevronIcon } from '../glass/icons';
import { useReader } from '../stores/readerStore';
import { percentLabel } from './format';
import { Sheet } from './Sheet';

/** Índice del libro: capítulos con sus secciones; el actual resaltado. Tocar salta y deja la píldora de volver. */
export function TocSheet({ engine }: { engine: ReaderEngine | null }) {
  const manifest = useReader((s) => s.manifest);
  const position = useReader((s) => s.position);
  const pages = useReader((s) => s.pages);
  const openSheet = useReader((s) => s.openSheet);
  const setChrome = useReader((s) => s.setChrome);
  const [expanded, setExpanded] = useState<string | null>(position?.chapterId ?? null);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  if (!manifest) return null;
  const close = () => openSheet(null);
  const jump = (go: () => Promise<void> | undefined) => {
    close();
    setChrome(false);
    go()?.catch(() => {});
  };

  return (
    <Sheet
      title="Contenido"
      subtitle={`${manifest.title} · ${percentLabel(position?.percent ?? 0)} leído`}
      testId="toc-sheet"
      onClose={close}
    >
      <ol className="rc-toc">
        {manifest.chapters.map((chapter, index) => {
          const current = chapter.id === position?.chapterId;
          const open = expanded === chapter.id;
          const start = pages ? (pages.chapterStarts[index] ?? 0) + 1 : null;
          return (
            <li
              key={chapter.id}
              ref={current ? currentRef : undefined}
              className={`rc-toc-chapter${current ? ' is-current' : ''}`}
            >
              <div className="rc-toc-row">
                <button
                  type="button"
                  className="rc-toc-link"
                  data-chapter={chapter.id}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => jump(() => engine?.goToChapter(chapter.id, { recordJump: true }))}
                >
                  {chapter.label !== chapter.title ? <small>{chapter.label}</small> : null}
                  <strong>{chapter.title}</strong>
                  <em>{start ?? ''}</em>
                </button>
                {chapter.sections.length > 0 ? (
                  <button
                    type="button"
                    className="rc-toc-toggle"
                    aria-expanded={open}
                    aria-label={open ? 'Ocultar secciones' : 'Ver secciones'}
                    onClick={() => setExpanded(open ? null : chapter.id)}
                  >
                    <ChevronIcon />
                  </button>
                ) : null}
              </div>
              {open ? (
                <ol className="rc-toc-sections">
                  {chapter.sections.map((section) => (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() =>
                          jump(() =>
                            engine?.goToBlock(chapter.id, section.blockId, { recordJump: true }),
                          )
                        }
                      >
                        {section.number ? <span>{section.number}</span> : null}
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
