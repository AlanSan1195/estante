import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  destructive?: boolean;
  testId?: string;
  onSelect(): void;
}

/** Menú contextual de vidrio anclado a un botón (••• del libro, ordenar…). */
export function PopoverMenu({
  anchor,
  items,
  onClose,
  label,
}: {
  anchor: DOMRect;
  items: MenuItem[];
  onClose(): void;
  label: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const left = Math.min(Math.max(12, anchor.right - width), vw - width - 12);
    const below = anchor.bottom + 8 + height < vh - 100;
    const top = below ? anchor.bottom + 8 : Math.max(12, anchor.top - 8 - height);
    setStyle({ left, top, transformOrigin: below ? 'top right' : 'bottom right' });
  }, [anchor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="app-overlay">
      <div className="app-popover-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="glass app-menu" role="menu" aria-label={label} style={style}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`app-menu-item${item.destructive ? ' is-destructive' : ''}`}
            data-testid={item.testId}
            onClick={() => item.onSelect()}
          >
            <span>{item.label}</span>
            {item.checked !== undefined ? (
              <span className="app-menu-check" aria-hidden="true">
                {item.checked ? '✓' : ''}
              </span>
            ) : (
              item.icon
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
