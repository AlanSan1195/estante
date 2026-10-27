import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../../core/domain/annotations';
import { HIGHLIGHT_COLORS } from '../../core/domain/highlights';
import type { ReaderEngine } from '../../reader-engine/engine';
import { NoteIcon, TrashIcon } from '../glass/icons';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { selectionParts } from './highlightDom';

const COLOR_NAMES: Record<HighlightColor, string> = {
  yellow: 'amarillo',
  green: 'verde',
  blue: 'azul',
  pink: 'rosa',
  purple: 'morado',
};

const MARGIN = 12;

/**
 * Barra de subrayado. Aparece al seleccionar texto (pulsación larga) y al tocar un subrayado
 * existente. Se coloca debajo de la selección para no tapar el menú nativo de iOS.
 */
export function SelectionToolbar({ engine }: { engine: ReaderEngine | null }) {
  const toolbar = useStudy((s) => s.toolbar);
  const setToolbar = useStudy((s) => s.setToolbar);
  const highlights = useStudy((s) => s.highlights);
  const openSheet = useReader((s) => s.openSheet);
  const bar = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Selección del sistema → barra (con un pequeño retraso: iOS ajusta la selección varias veces).
  useEffect(() => {
    if (!engine) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        const current = useStudy.getState().toolbar;
        const container = engine.currentContainer();
        if (!selection || selection.isCollapsed || !container) {
          if (current?.kind === 'selection') setToolbar(null);
          return;
        }
        const parts = selectionParts(selection, container);
        if (parts.length === 0) {
          if (current?.kind === 'selection') setToolbar(null);
          return;
        }
        const range = selection.getRangeAt(0);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const first = rects[0];
        const last = rects.at(-1);
        const box = range.getBoundingClientRect();
        const rect =
          first && last
            ? {
                x: box.left,
                y: first.top,
                width: box.width,
                height: last.bottom - first.top,
              }
            : { x: box.left, y: box.top, width: box.width, height: box.height };
        useStudy.setState({ termPopover: null });
        setToolbar({ kind: 'selection', rect, parts });
      }, 220);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [engine, setToolbar]);

  useLayoutEffect(() => {
    if (!toolbar || !bar.current) return;
    const { rect } = toolbar;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = bar.current.offsetWidth;
    const height = bar.current.offsetHeight;
    const left = Math.min(
      Math.max(MARGIN, rect.x + rect.width / 2 - width / 2),
      vw - width - MARGIN,
    );
    const below = rect.y + rect.height + 14;
    const top = below + height < vh - 70 ? below : Math.max(MARGIN + 50, rect.y - 14 - height);
    setStyle({ left, top });
  }, [toolbar]);

  if (!toolbar) return null;
  const existing =
    toolbar.kind === 'highlight' ? highlights.find((h) => h.id === toolbar.highlightId) : null;
  if (toolbar.kind === 'highlight' && !existing) return null;

  const clearSelection = () => window.getSelection()?.removeAllRanges();

  const pick = async (color: HighlightColor) => {
    const study = useStudy.getState();
    if (toolbar.kind === 'selection') {
      await study.addHighlights(toolbar.parts, color);
      clearSelection();
    } else if (existing) {
      await study.updateHighlight(existing.id, { color });
    }
    setToolbar(null);
  };

  const note = async () => {
    const study = useStudy.getState();
    let id = existing?.id ?? null;
    if (toolbar.kind === 'selection') {
      const created = await study.addHighlights(toolbar.parts, 'yellow');
      clearSelection();
      id = created[0]?.id ?? null;
    }
    setToolbar(null);
    if (id) {
      study.setNoteFor(id);
      openSheet('note');
    }
  };

  return (
    <div
      ref={bar}
      className="glass rc-hl-bar"
      role="toolbar"
      aria-label={existing ? 'Editar subrayado' : 'Subrayar selección'}
      data-testid="highlight-toolbar"
      style={style}
      // Mantener la selección al tocar la barra (si no, iOS la borra antes del clic).
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="rc-hl-color"
          data-color={color}
          aria-label={`Subrayar en ${COLOR_NAMES[color]}`}
          aria-pressed={existing?.color === color}
          onClick={() => {
            pick(color).catch(() => {});
          }}
        />
      ))}
      <span className="rc-hl-sep" aria-hidden="true" />
      <button
        type="button"
        className="rc-hl-action"
        aria-label={existing?.note ? 'Editar nota' : 'Añadir nota'}
        onClick={() => {
          note().catch(() => {});
        }}
      >
        <NoteIcon />
      </button>
      {existing ? (
        <button
          type="button"
          className="rc-hl-action"
          aria-label="Borrar subrayado"
          onClick={() => {
            useStudy
              .getState()
              .removeHighlight(existing.id)
              .catch(() => {});
          }}
        >
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}

/** Hoja para escribir o editar la nota de un subrayado. */
export function NoteSheetBody({ onDone }: { onDone(): void }) {
  const noteFor = useStudy((s) => s.noteFor);
  const highlight = useStudy((s) => s.highlights.find((h) => h.id === s.noteFor) ?? null);
  const [text, setText] = useState(highlight?.note ?? '');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus({ preventScroll: true });
  }, []);

  if (!noteFor || !highlight) return null;
  const save = async () => {
    await useStudy.getState().updateHighlight(highlight.id, { note: text.trim() || null });
    onDone();
  };

  return (
    <div className="rc-note-editor">
      <q data-color={highlight.color}>{highlight.quote}</q>
      <textarea
        ref={area}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Escribe una nota…"
        rows={5}
        aria-label="Nota del subrayado"
      />
      <div className="rc-note-buttons">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button
          type="button"
          className="is-primary"
          onClick={() => {
            save().catch(() => {});
          }}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
