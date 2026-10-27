import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { GlassButton } from '../glass/GlassButton';
import { CloseIcon } from '../glass/icons';

interface SheetProps {
  title: string;
  subtitle?: string;
  testId?: string;
  onClose(): void;
  children: ReactNode;
}

/** Hoja inferior de vidrio. Se cierra con el fondo, con Escape o arrastrando el asa hacia abajo. */
export function Sheet({ title, subtitle, testId, onClose, children }: SheetProps) {
  const [dragY, setDragY] = useState(0);
  const start = useRef<{ y: number; id: number } | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = { y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== event.pointerId) return;
    setDragY(Math.max(0, event.clientY - start.current.y));
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    if (dragY > 110) onClose();
    else setDragY(0);
  };

  return (
    <>
      <div className="rc-backdrop" onClick={onClose} aria-hidden="true" />
      <section
        ref={panel}
        className="rc-sheet glass"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        tabIndex={-1}
        style={dragY ? { translate: `0 ${dragY}px`, transition: 'none' } : undefined}
      >
        <div
          className="rc-sheet-handle"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <header className="rc-sheet-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <GlassButton aria-label="Cerrar" onClick={onClose}>
            <CloseIcon />
          </GlassButton>
        </header>
        <div className="rc-sheet-body">{children}</div>
      </section>
    </>
  );
}
