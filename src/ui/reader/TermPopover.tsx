import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';

const GAP = 10;
const MARGIN = 12;

/** Popover de vidrio con la definición de un término del glosario tocado en el texto. */
export function TermPopover() {
  const popover = useStudy((s) => s.termPopover);
  const manifest = useReader((s) => s.manifest);
  const openSheet = useReader((s) => s.openSheet);
  const setGlossaryFocus = useStudy((s) => s.setGlossaryFocus);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const close = () => useStudy.setState({ termPopover: null });

  useLayoutEffect(() => {
    if (!popover || !panel.current) return;
    const { rect } = popover;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - MARGIN * 2);
    const height = panel.current.offsetHeight;
    const left = Math.min(
      Math.max(MARGIN, rect.x + rect.width / 2 - width / 2),
      vw - width - MARGIN,
    );
    const below = rect.y + rect.height + GAP + height < vh - MARGIN || rect.y < height + GAP * 2;
    const top = below ? rect.y + rect.height + GAP : rect.y - GAP - height;
    const arrow = Math.min(Math.max(18, rect.x + rect.width / 2 - left), width - 18);
    setStyle({
      width,
      left,
      top: Math.max(MARGIN, top),
      ['--arrow-x' as string]: `${arrow}px`,
    });
    panel.current.dataset.side = below ? 'below' : 'above';
  }, [popover]);

  useEffect(() => {
    if (!popover) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useStudy.setState({ termPopover: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popover]);

  if (!popover || !manifest) return null;
  const term = manifest.glossary.find((t) => t.id === popover.termId);
  if (!term) return null;
  const aliases = term.aliases.filter((a) => a !== term.term);

  return (
    <>
      <div className="rc-popover-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        className="glass rc-term"
        role="dialog"
        aria-label={`Definición de ${term.term}`}
        data-testid="term-popover"
        style={style}
      >
        <p className="rc-term-kicker">Glosario</p>
        <h3>{term.term}</h3>
        {aliases.length > 1 ? <p className="rc-term-aliases">{aliases.join(' · ')}</p> : null}
        {/* La definición viene del propio libro, renderizada en build. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generado por el pipeline */}
        <p className="rc-term-def" dangerouslySetInnerHTML={{ __html: term.definitionHtml }} />
        <button
          type="button"
          className="rc-term-more"
          onClick={() => {
            close();
            setGlossaryFocus(term.id);
            openSheet('glossary');
          }}
        >
          Ver en el glosario
        </button>
      </div>
    </>
  );
}
