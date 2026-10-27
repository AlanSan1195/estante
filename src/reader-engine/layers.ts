/**
 * Capas de página. Siempre hay tres montadas (anterior, actual y siguiente) más la solapa del curl
 * y un medidor invisible. Cada capa guarda el capítulo que contiene: pasar de página dentro del
 * mismo capítulo solo cambia un `translate3d`; cambiar de capítulo reemplaza su HTML.
 *
 *   .rd-page            ← fondo de papel; recibe clip-path (curl) o transform (deslizar)
 *     .rd-frame         ← caja de texto (márgenes y safe areas)
 *       .rd-flow        ← contenedor multi-column, trasladado −página·W
 *         article.chapter
 */

import type { ChapterDecorator } from './types';

/**
 * Los SVG de Mermaid usan ids propios (marcadores de flecha, degradados, estilos `#id …`). Como el
 * mismo capítulo vive en varias capas a la vez, cada copia recibe un prefijo para que sus
 * referencias `url(#…)` apunten a sus propias definiciones y no a las de una capa oculta.
 */
export function scopeSvgIds(html: string, prefix: string): string {
  if (!html.includes('<svg')) return html;
  const roots = new Set<string>();
  for (const match of html.matchAll(/<svg\b[^>]*\sid="([^"]+)"/g)) {
    if (match[1]) roots.add(match[1]);
  }
  let out = html;
  for (const root of roots) out = out.split(root).join(`${prefix}${root}`);
  return out;
}

const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';

/**
 * Añade el botón ⤢ (abrir en el visor) a código y tablas. Va en posición absoluta, así que no
 * cambia la paginación. Tocar el resto del bloque se comporta como texto (controles / pasar página).
 */
export function decorateBlocks(root: ParentNode): void {
  for (const block of root.querySelectorAll<HTMLElement>(
    'article.chapter > .b-code, article.chapter > .b-table',
  )) {
    if (block.querySelector(':scope > .rd-expand')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rd-expand';
    button.setAttribute(
      'aria-label',
      block.classList.contains('b-code') ? 'Ampliar código' : 'Ampliar tabla',
    );
    button.innerHTML = EXPAND_ICON;
    block.appendChild(button);
  }
}

export type BlankKind = 'start' | 'end' | 'loading';

export interface PageElements {
  el: HTMLDivElement;
  frame: HTMLDivElement;
  flow: HTMLDivElement;
}

export function createPageElements(className: string): PageElements {
  const el = document.createElement('div');
  el.className = `rd-page ${className}`;
  const frame = document.createElement('div');
  frame.className = 'rd-frame';
  const flow = document.createElement('div');
  flow.className = 'rd-flow';
  frame.appendChild(flow);
  el.appendChild(frame);
  return { el, frame, flow };
}

export class PageLayer {
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly flow: HTMLDivElement;
  /** Se aplica cada vez que la capa recibe el HTML de un capítulo (ver ChapterDecorator). */
  decorator: ChapterDecorator | null = null;
  chapterId: string | null = null;
  page = -1;
  blank: BlankKind | null = null;

  constructor(
    readonly name: string,
    className = '',
  ) {
    const parts = createPageElements(`rd-layer ${className}`.trim());
    this.el = parts.el;
    this.frame = parts.frame;
    this.flow = parts.flow;
    this.el.dataset.layer = name;
  }

  show(chapterId: string, html: string, page: number, pageWidth: number): void {
    if (this.chapterId !== chapterId || this.blank) {
      this.flow.innerHTML = scopeSvgIds(html, `${this.name}-`);
      decorateBlocks(this.flow);
      this.decorator?.(this.flow, chapterId);
      this.chapterId = chapterId;
      this.blank = null;
      this.el.classList.remove('is-blank');
      delete this.el.dataset.blank;
    }
    this.page = page;
    this.el.dataset.chapter = chapterId;
    this.el.dataset.page = String(page);
    this.flow.style.transform = `translate3d(${-page * pageWidth}px, 0, 0)`;
  }

  /** Página vacía: inicio o fin del libro, o capítulo todavía cargando. */
  showBlank(kind: BlankKind, label = ''): void {
    if (this.blank === kind) return;
    this.blank = kind;
    this.chapterId = null;
    this.page = -1;
    this.el.classList.add('is-blank');
    this.el.dataset.blank = kind;
    delete this.el.dataset.chapter;
    delete this.el.dataset.page;
    this.flow.style.transform = '';
    this.flow.innerHTML = label ? `<p class="rd-blank-label">${label}</p>` : '';
  }

  /** Vuelve a aplicar el decorador sobre el capítulo ya montado. */
  redecorate(): void {
    if (this.chapterId && !this.blank) this.decorator?.(this.flow, this.chapterId);
  }

  setRole(role: 'current' | 'next' | 'prev' | 'hidden'): void {
    this.el.dataset.role = role;
  }

  resetEffects(): void {
    this.el.style.clipPath = '';
    this.el.style.transform = '';
    this.el.style.zIndex = '';
  }
}

/** Contenedor invisible con la misma tipografía: mide capítulos sin tocar lo que se ve. */
export class Measurer {
  readonly elements: PageElements;
  private chapterId: string | null = null;

  constructor(parent: HTMLElement) {
    this.elements = createPageElements('rd-measure');
    this.elements.el.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.elements.el);
  }

  load(chapterId: string, html: string): HTMLDivElement {
    if (this.chapterId !== chapterId) {
      this.elements.flow.innerHTML = scopeSvgIds(html, 'measure-');
      this.chapterId = chapterId;
    }
    return this.elements.flow;
  }

  /** Obliga a volver a cargar (p. ej. tras cambiar la tipografía no hace falta, pero sí al destruir). */
  clear(): void {
    this.elements.flow.innerHTML = '';
    this.chapterId = null;
  }

  frameSize(): { width: number; height: number } {
    const rect = this.elements.frame.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}

/** Solapa del curl: copia reflejada de la página que gira, con sombreado propio. */
export class FlapLayer {
  readonly el: HTMLDivElement;
  readonly page: PageLayer;
  readonly shade: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'rd-flap';
    this.page = new PageLayer('flap', 'rd-flap-page');
    this.shade = document.createElement('div');
    this.shade.className = 'rd-flap-shade';
    this.el.append(this.page.el, this.shade);
  }
}
