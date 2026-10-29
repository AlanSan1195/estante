import { useEffect } from 'react';
import type { ReaderEngine } from '../../reader-engine/engine';
import { GlassButton } from '../glass/GlassButton';
import { CloseIcon, MenuLinesIcon, ReturnIcon } from '../glass/icons';
import { progressSaver } from '../services';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { AnnotationsSheet } from './AnnotationsSheet';
import { bookmarksOnPage } from './bookmarks';
import { jumpLabel, pageLabel } from './format';
import { GlossarySheet } from './GlossarySheet';
import { MENU_EXIT_MS, ReaderMenu } from './ReaderMenu';
import { Scrubber } from './Scrubber';
import { SearchSheet } from './SearchSheet';
import { NoteSheetBody, SelectionToolbar } from './SelectionToolbar';
import { SettingsSheet } from './SettingsSheet';
import { Sheet } from './Sheet';
import { TermPopover } from './TermPopover';
import { TocSheet } from './TocSheet';
import { usePresence } from './usePresence';
import { Viewer } from './Viewer';

/**
 * Controles sobre la página. React solo pinta esto; la página y sus animaciones son del motor.
 * Arriba: píldora para volver tras un salto, título y cerrar. Abajo: botón ≡, barra de recorrido
 * y "pág. N de M" (siempre visible, discreto).
 */
export function Chrome({ engine, title }: { engine: ReaderEngine | null; title: string }) {
  const chromeVisible = useReader((s) => s.chromeVisible);
  const sheet = useReader((s) => s.sheet);
  const position = useReader((s) => s.position);
  const jumpBack = useReader((s) => s.jumpBack);
  const toast = useReader((s) => s.toast);
  const openSheet = useReader((s) => s.openSheet);
  const setJumpBack = useReader((s) => s.setJumpBack);
  const viewer = useReader((s) => s.viewer);
  const openViewer = useReader((s) => s.openViewer);
  useStudy((s) => s.bookmarks);
  const marked = position ? bookmarksOnPage(engine).length > 0 : false;
  // El menú sigue montado mientras sus piezas vuelven al botón ≡.
  const menu = usePresence(sheet === 'menu', MENU_EXIT_MS);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const study = useStudy.getState();
      if (viewer) openViewer(null);
      else if (sheet) openSheet(null);
      else if (study.toolbar || study.termPopover)
        useStudy.setState({ toolbar: null, termPopover: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, sheet, openViewer, openSheet]);

  const hidden = chromeVisible ? '' : ' rc-hidden';

  return (
    <div className="rc-layer" data-chrome={chromeVisible ? 'shown' : 'hidden'}>
      <div className="rc-top">
        <div>
          {jumpBack ? (
            <button
              type="button"
              className="glass rc-back-pill"
              data-testid="jump-back"
              aria-label={`Volver a ${jumpLabel(jumpBack)}`}
              onClick={() => {
                setJumpBack(null);
                engine?.goTo(jumpBack.location).catch(() => {});
              }}
            >
              <ReturnIcon />
              {jumpLabel(jumpBack)}
            </button>
          ) : null}
        </div>
        <div className={`rc-title${hidden}`} data-testid="chrome-title">
          <strong>{title}</strong>
          <span>{position?.chapterTitle ?? ''}</span>
        </div>
        <a
          className={`glass glass-button rc-close${hidden}`}
          href="/"
          aria-label="Cerrar libro"
          onClick={(event) => {
            progressSaver.flush().catch(() => {});
            // Si llegaste desde otra página de la app, la X vuelve a ella (con su transición).
            const state = history.state as { index?: number } | null;
            if (state && typeof state.index === 'number' && state.index > 0) {
              event.preventDefault();
              history.back();
            }
          }}
        >
          <CloseIcon />
        </a>
      </div>

      {marked ? (
        <div
          className="rc-ribbon"
          data-testid="bookmark-ribbon"
          role="img"
          aria-label="Página marcada"
        />
      ) : null}

      <div
        className={`rc-page-label${chromeVisible ? ' is-raised' : ''}`}
        data-testid="page-label"
        aria-live="polite"
      >
        {pageLabel(position)}
      </div>

      <div className={`rc-bottom rc-fade${hidden}`}>
        <GlassButton
          className="rc-menu-button"
          aria-label="Menú del libro"
          aria-expanded={sheet === 'menu'}
          data-testid="menu-button"
          onClick={() => openSheet(sheet === 'menu' ? null : 'menu')}
        >
          <MenuLinesIcon />
        </GlassButton>
        <Scrubber engine={engine} />
      </div>

      <SelectionToolbar engine={engine} />
      <TermPopover />
      {menu.mounted ? <ReaderMenu title={title} engine={engine} closing={menu.closing} /> : null}
      {sheet === 'toc' ? <TocSheet engine={engine} /> : null}
      {sheet === 'settings' ? <SettingsSheet /> : null}
      {sheet === 'annotations' ? <AnnotationsSheet engine={engine} /> : null}
      {sheet === 'search' ? <SearchSheet engine={engine} /> : null}
      {sheet === 'glossary' ? <GlossarySheet engine={engine} /> : null}
      {sheet === 'note' ? (
        <Sheet title="Nota" testId="note-sheet" onClose={() => openSheet(null)}>
          <NoteSheetBody onDone={() => openSheet(null)} />
        </Sheet>
      ) : null}
      <Viewer />
      {toast ? <div className="rc-toast glass">{toast}</div> : null}
    </div>
  );
}
