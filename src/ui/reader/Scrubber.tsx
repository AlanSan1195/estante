import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import type { ReaderEngine } from '../../reader-engine/engine';
import { useReader } from '../stores/readerStore';
import { chapterShort, percentLabel } from './format';

interface Preview {
  value: number;
  title: string;
  detail: string;
}

/**
 * Barra de recorrido rápido. Con páginas globales trabaja en páginas; mientras se calculan, en
 * porcentaje. Al arrastrar muestra "Cap. 9 · Título — pág. 212" y salta al soltar (con píldora de volver).
 */
export function Scrubber({ engine }: { engine: ReaderEngine | null }) {
  const position = useReader((s) => s.position);
  const pages = useReader((s) => s.pages);
  const manifest = useReader((s) => s.manifest);
  const track = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const byPages = Boolean(pages && position?.mode === 'paged');
  const max = byPages && pages ? Math.max(1, pages.total - 1) : 1;
  const current = byPages ? (position?.globalPage ?? 0) : (position?.percent ?? 0);
  const value = preview ? preview.value : current;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  const describeValue = (v: number): Preview => {
    if (byPages) {
      const d = engine?.describeGlobalPage(v);
      const chapter = d ? manifest?.chapters[d.chapterIndex] : undefined;
      return {
        value: v,
        title: chapter ? `${chapterShort(chapter)} · ${chapter.title}` : '',
        detail: `pág. ${v + 1} de ${pages?.total ?? ''}`,
      };
    }
    const d = engine?.describePercent(v);
    const chapter = d ? manifest?.chapters[d.chapterIndex] : undefined;
    return {
      value: v,
      title: chapter ? `${chapterShort(chapter)} · ${chapter.title}` : '',
      detail: percentLabel(v),
    };
  };

  const valueAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return byPages ? Math.round(f * max) : f;
  };

  const commit = (v: number) => {
    if (!engine) return;
    const go = byPages
      ? engine.goToGlobalPage(v, { recordJump: true })
      : engine.goToPercent(v, { recordJump: true });
    go.catch(() => {});
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(describeValue(valueAt(event.clientX)));
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!preview) return;
    setPreview(describeValue(valueAt(event.clientX)));
  };
  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!preview) return;
    const v = valueAt(event.clientX);
    setPreview(null);
    if ((byPages && v !== current) || (!byPages && Math.abs(v - current) > 0.002)) commit(v);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = byPages ? 1 : 0.01;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
      commit(Math.min(max, current + step));
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      commit(Math.max(0, current - step));
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={`rc-scrubber glass${preview ? ' is-active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Recorrer el libro"
      aria-valuemin={0}
      aria-valuemax={byPages ? max + 1 : 100}
      aria-valuenow={byPages ? Math.round(value) + 1 : Math.round(value * 100)}
      aria-valuetext={describeValue(value).detail}
      data-testid="scrubber"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setPreview(null)}
      onKeyDown={onKey}
    >
      <div className="rc-scrubber-track" ref={track}>
        <div className="rc-scrubber-fill" style={{ width: `${fraction * 100}%` }} />
        <div className="rc-scrubber-thumb" style={{ left: `${fraction * 100}%` }} />
        {preview ? (
          <div
            className="rc-scrubber-bubble glass"
            style={{ left: `clamp(110px, ${fraction * 100}%, calc(100% - 110px))` }}
          >
            {preview.title}
            <small>{preview.detail}</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
