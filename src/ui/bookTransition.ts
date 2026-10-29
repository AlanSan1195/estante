/**
 * Transición portada ↔ lector con View Transitions (ClientRouter de Astro).
 *
 * Al abrir, la portada del estante crece hasta la portada a pantalla completa del lector
 * (`.reader-intro`, en leer/[slug].astro), que se funde con la página cuando el libro está listo.
 * Al cerrar, la propia página se encoge hasta su portada en el estante y se funde en ella.
 *
 * Solo esa pareja lleva nombre de transición, y solo durante la navegación: así el resto de portadas
 * no salen como grupos sueltos que se desvanecen, y src/styles/transitions.css usa un nombre fijo.
 */

import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';

/** Nombre compartido por la portada y su pareja en el lector (transitions.css). */
export const BOOK_TRANSITION_NAME = 'book-active';

const READER_PATH = /^\/leer\/([^/]+)\/?$/;

export interface BookNavigation {
  slug: string;
  opening: boolean;
}

/** Si una navegación abre un libro (hacia /leer/<slug>) o lo cierra (desde ahí), y cuál. */
export function bookNavigation(from: URL, to: URL): BookNavigation | null {
  const opened = to.pathname.match(READER_PATH)?.[1];
  const closed = from.pathname.match(READER_PATH)?.[1];
  if (opened && !closed) return { slug: decodeURIComponent(opened), opening: true };
  if (closed && !opened) return { slug: decodeURIComponent(closed), opening: false };
  return null;
}

/** Portada del libro en una página del estante: la del enlace pulsado, si la hay. */
function coverOf(root: ParentNode, slug: string, near?: Element): Element | null {
  const selector = `[data-book-cover="${CSS.escape(slug)}"]`;
  return near?.querySelector(selector) ?? root.querySelector(selector);
}

const INSTALLED = Symbol.for('estante.bookTransition');

/** Escucha la navegación del ClientRouter (una sola vez por carga completa de la app). */
export function installBookTransition(): void {
  const flags = window as unknown as Record<symbol, boolean>;
  if (flags[INSTALLED]) return;
  flags[INSTALLED] = true;

  let pending: (BookNavigation & { source?: Element }) | null = null;
  const named: HTMLElement[] = [];
  const mark = (element: Element | null | undefined) => {
    if (!(element instanceof HTMLElement)) return;
    element.style.viewTransitionName = BOOK_TRANSITION_NAME;
    named.push(element);
  };
  const clear = () => {
    for (const element of named.splice(0)) element.style.viewTransitionName = '';
  };

  document.addEventListener('astro:before-preparation', (event) => {
    const { from, to, sourceElement } = event as TransitionBeforePreparationEvent;
    clear();
    const navigation = bookNavigation(from, to);
    pending = navigation ? { ...navigation, source: sourceElement } : null;
  });

  // Lado viejo, justo antes de que el navegador lo capture (no antes: mientras se descarga la
  // página nueva, la actual sigue como está).
  document.addEventListener('astro:after-preparation', () => {
    if (!pending) return;
    mark(
      pending.opening
        ? coverOf(document, pending.slug, pending.source)
        : document.querySelector('.reader'),
    );
  });

  // Lado nuevo, en el documento recién descargado. Inicio pinta "Continuar leyendo" al hidratar,
  // así que al cerrar hacia allí se apunta a su esqueleto, que ocupa el mismo sitio.
  document.addEventListener('astro:before-swap', (event) => {
    const { newDocument, viewTransition } = event as TransitionBeforeSwapEvent;
    const navigation = pending;
    pending = null;
    if (!navigation) return;
    mark(
      navigation.opening
        ? newDocument.querySelector('.reader-intro')
        : (coverOf(newDocument, navigation.slug) ?? newDocument.querySelector('[data-book-slot]')),
    );
    viewTransition.finished.finally(clear);
  });
}
