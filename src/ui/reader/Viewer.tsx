import { type PointerEvent, useCallback, useEffect, useRef, type WheelEvent } from 'react';
import { scopeSvgIds } from '../../reader-engine/layers';
import type { ViewerRequest } from '../../reader-engine/types';
import { GlassButton } from '../glass/GlassButton';
import { CloseIcon, CopyIcon, ResetZoomIcon } from '../glass/icons';
import { useReader } from '../stores/readerStore';

const TITLES: Record<ViewerRequest['kind'], string> = {
  code: 'Código',
  table: 'Tabla',
  diagram: 'Diagrama',
};

/** Visor a pantalla completa para código (scroll horizontal y copiar), tablas y diagramas (zoom). */
export function Viewer() {
  const viewer = useReader((s) => s.viewer);
  const openViewer = useReader((s) => s.openViewer);
  const showToast = useReader((s) => s.showToast);
  const close = useCallback(() => openViewer(null), [openViewer]);

  if (!viewer) return null;
  const html = scopeSvgIds(viewer.html, 'viewer-');
  const title =
    viewer.label && viewer.kind === 'code'
      ? `${TITLES.code} · ${viewer.label}`
      : TITLES[viewer.kind];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(viewer.text);
      showToast('Código copiado');
    } catch {
      showToast('No se pudo copiar');
    }
  };

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label={title} data-testid="viewer">
      <div className="rv-bar">
        <h2>{title}</h2>
        <div className="rv-bar-actions">
          {viewer.kind === 'code' ? (
            <GlassButton aria-label="Copiar código" onClick={copy}>
              <CopyIcon />
            </GlassButton>
          ) : null}
          <GlassButton aria-label="Cerrar visor" onClick={close}>
            <CloseIcon />
          </GlassButton>
        </div>
      </div>
      {viewer.kind === 'diagram' ? (
        <DiagramZoom html={html} />
      ) : (
        <div className="rv-body">
          <div
            className={viewer.kind === 'code' ? 'rv-code' : 'rv-table'}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generado en build por el pipeline del propio libro
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

/** Pellizco con dos dedos, arrastre con uno, rueda o doble toque para acercar. Solo transform. */
function DiagramZoom({ html }: { html: string }) {
  const area = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const state = useRef<ZoomState>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    scale: number;
    cx: number;
    cy: number;
    x: number;
    y: number;
  } | null>(null);
  const lastTap = useRef(0);

  const apply = useCallback(() => {
    const { scale, x, y } = state.current;
    if (inner.current) inner.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }, []);

  const zoomAt = useCallback(
    (nextScale: number, cx: number, cy: number) => {
      const s = state.current;
      const scale = Math.min(6, Math.max(1, nextScale));
      // Mantiene fijo el punto bajo el dedo (cx, cy en coordenadas del área).
      const k = scale / s.scale;
      state.current =
        scale === 1
          ? { scale: 1, x: 0, y: 0 }
          : { scale, x: cx - (cx - s.x) * k, y: cy - (cy - s.y) * k };
      apply();
    },
    [apply],
  );

  useEffect(() => {
    apply();
  }, [apply]);

  const local = (event: PointerEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        pinch.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: state.current.scale,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          x: state.current.x,
          y: state.current.y,
        };
      }
    } else if (pointers.current.size === 1) {
      const now = event.timeStamp;
      if (now - lastTap.current < 300) {
        const p = local(event);
        zoomAt(state.current.scale > 1.2 ? 1 : 2.5, p.x, p.y);
      }
      lastTap.current = now;
    }
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const p = pinch.current;
      const scale = Math.min(
        6,
        Math.max(1, p.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.distance)),
      );
      const k = scale / p.scale;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      state.current = { scale, x: cx - (p.cx - p.x) * k, y: cy - (p.cy - p.y) * k };
      apply();
    } else if (pointers.current.size === 1 && state.current.scale > 1) {
      state.current = {
        ...state.current,
        x: state.current.x + point.x - previous.x,
        y: state.current.y + point.y - previous.y,
      };
      apply();
    }
  };

  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    zoomAt(
      state.current.scale * Math.exp(-event.deltaY * 0.0015),
      event.clientX - (rect?.left ?? 0),
      event.clientY - (rect?.top ?? 0),
    );
  };

  return (
    <div
      ref={area}
      className="rv-diagram"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG del diagrama generado en build */}
      <div ref={inner} className="rv-diagram-inner" dangerouslySetInnerHTML={{ __html: html }} />
      <GlassButton
        className="rv-reset"
        aria-label="Restablecer zoom"
        onClick={() => zoomAt(1, 0, 0)}
        style={{ position: 'absolute', right: 14, bottom: 'calc(var(--safe-bottom) + 14px)' }}
      >
        <ResetZoomIcon />
      </GlassButton>
      <p className="rv-hint glass">Pellizca o toca dos veces para acercar</p>
    </div>
  );
}
