import type { ReaderEngine } from '../../reader-engine/engine';
import { GlassButton } from '../glass/GlassButton';
import {
  BookmarkIcon,
  GlossaryIcon,
  ListIcon,
  ScrollModeIcon,
  SearchIcon,
  ShareIcon,
} from '../glass/icons';
import { usePrefs } from '../stores/prefsStore';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { bookmarksOnPage, toggleBookmark } from './bookmarks';
import { percentLabel } from './format';

/** Menú de píldoras de vidrio que sale del botón ≡ (como Apple Books). */
export function ReaderMenu({ title, engine }: { title: string; engine: ReaderEngine | null }) {
  const position = useReader((s) => s.position);
  const openSheet = useReader((s) => s.openSheet);
  const showToast = useReader((s) => s.showToast);
  const pageTurn = usePrefs((s) => s.prefs.pageTurn);
  const toggleScroll = usePrefs((s) => s.toggleScroll);
  const annotations = useStudy((s) => s.bookmarks.length + s.highlights.length);
  // Se recalcula con cada render (la lista de marcadores o la posición cambian el resultado).
  useStudy((s) => s.bookmarks);
  const marked = bookmarksOnPage(engine).length > 0;
  const percent = position?.percent ?? 0;

  const share = async () => {
    const url = window.location.href;
    const text = position ? `${title} — ${position.chapterTitle}` : title;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showToast('No se pudo compartir');
    }
  };

  return (
    <>
      <div className="rc-backdrop" onClick={() => openSheet(null)} aria-hidden="true" />
      <div className="rc-menu" role="dialog" aria-label="Menú del libro" data-testid="reader-menu">
        <button
          type="button"
          className="glass rc-pill"
          data-testid="menu-toc"
          onClick={() => openSheet('toc')}
        >
          <span className="rc-pill-progress" style={{ width: `${percent * 100}%` }} />
          <span>Contenido · {percentLabel(percent)}</span>
          <ListIcon />
        </button>
        <button
          type="button"
          className="glass rc-pill"
          data-testid="menu-annotations"
          onClick={() => openSheet('annotations')}
        >
          <span>Marcadores y subrayados</span>
          <span className="rc-pill-count">{annotations}</span>
        </button>
        <button
          type="button"
          className="glass rc-pill"
          data-testid="menu-search"
          onClick={() => openSheet('search')}
        >
          <span>Buscar en el libro</span>
          <SearchIcon />
        </button>
        <button
          type="button"
          className="glass rc-pill"
          data-testid="menu-settings"
          onClick={() => openSheet('settings')}
        >
          <span>Temas y ajustes</span>
          <span className="rc-aa" aria-hidden="true">
            <small>A</small>A
          </span>
        </button>
        <div className="rc-menu-row">
          <GlassButton aria-label="Compartir" onClick={share}>
            <ShareIcon />
          </GlassButton>
          <GlassButton
            aria-label="Glosario"
            data-testid="menu-glossary"
            onClick={() => openSheet('glossary')}
          >
            <GlossaryIcon />
          </GlassButton>
          <GlassButton
            aria-label="Desplazamiento continuo"
            aria-pressed={pageTurn === 'scroll'}
            data-testid="menu-scroll"
            onClick={() => {
              toggleScroll();
              openSheet(null);
            }}
          >
            <ScrollModeIcon />
          </GlassButton>
          <GlassButton
            aria-label={marked ? 'Quitar marcador' : 'Marcar página'}
            aria-pressed={marked}
            data-testid="menu-bookmark"
            onClick={() => {
              openSheet(null);
              toggleBookmark(engine).catch(() => {});
            }}
          >
            <BookmarkIcon filled={marked} />
          </GlassButton>
        </div>
      </div>
    </>
  );
}
