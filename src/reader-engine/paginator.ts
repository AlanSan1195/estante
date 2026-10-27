/**
 * Paginación con CSS multi-column.
 *
 * Cada capítulo se dibuja en un contenedor de alto fijo con `column-width` igual al ancho de la
 * columna de texto y `column-gap` igual a dos márgenes: así cada "página" mide exactamente el ancho
 * de la pantalla y la página i se muestra trasladando el contenido −i·W (técnica de los lectores
 * EPUB). Medir los fragmentos de cada bloque (`getClientRects`) da un mapa bloque ↔ página que
 * permite traducir una Location estable a una página y viceversa, aunque cambie la tipografía.
 *
 * La parte de cálculo (`buildChapterLayout`, `locationToPage`, `pageAnchor`…) es pura; solo
 * `measureFlow` toca el DOM.
 */

export interface MeasuredFragment {
  /** Distancia horizontal desde el inicio del flujo (px). */
  left: number;
  right: number;
  height: number;
}

export interface MeasuredBlock {
  id: string;
  /** Palabras del capítulo antes de este bloque (`data-w`). */
  wordStart: number;
  /** Longitud del texto del bloque. */
  chars: number;
  fragments: MeasuredFragment[];
}

export interface BlockLayout {
  id: string;
  index: number;
  wordStart: number;
  words: number;
  chars: number;
  /** Altura del bloque en cada página donde aparece (en orden). */
  pages: { page: number; height: number }[];
  totalHeight: number;
}

export interface PageAnchor {
  blockId: string;
  charOffset: number;
}

export interface ChapterLayout {
  chapterId: string;
  pages: number;
  blocks: BlockLayout[];
  byId: Map<string, BlockLayout>;
  /** Primer bloque visible de cada página (con desplazamiento si el bloque viene de antes). */
  pageStarts: PageAnchor[];
}

export function pageOfOffset(left: number, pageWidth: number): number {
  if (pageWidth <= 0) return 0;
  return Math.max(0, Math.floor((left + 1) / pageWidth));
}

export function pagesFromExtent(maxRight: number, pageWidth: number): number {
  if (pageWidth <= 0) return 1;
  return Math.max(1, Math.ceil((maxRight - 1) / pageWidth));
}

export function buildChapterLayout(
  chapterId: string,
  measured: readonly MeasuredBlock[],
  chapterWords: number,
  pageWidth: number,
): ChapterLayout {
  let maxRight = 0;
  const blocks: BlockLayout[] = measured.map((block, index) => {
    const next = measured[index + 1];
    const byPage = new Map<number, number>();
    for (const fragment of block.fragments) {
      if (fragment.height <= 0 && fragment.right <= fragment.left) continue;
      maxRight = Math.max(maxRight, fragment.right);
      const page = pageOfOffset(fragment.left, pageWidth);
      byPage.set(page, (byPage.get(page) ?? 0) + Math.max(fragment.height, 1));
    }
    const pages = [...byPage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, height]) => ({ page, height }));
    return {
      id: block.id,
      index,
      wordStart: block.wordStart,
      words: Math.max(0, (next ? next.wordStart : chapterWords) - block.wordStart),
      chars: block.chars,
      pages,
      totalHeight: pages.reduce((sum, p) => sum + p.height, 0),
    };
  });

  const pages = pagesFromExtent(maxRight, pageWidth);
  const pageStarts: PageAnchor[] = [];
  for (let page = 0; page < pages; page++) {
    pageStarts.push(anchorForPage(blocks, page) ?? pageStarts[page - 1] ?? firstAnchor(blocks));
  }
  return { chapterId, pages, blocks, byId: new Map(blocks.map((b) => [b.id, b])), pageStarts };
}

function firstAnchor(blocks: readonly BlockLayout[]): PageAnchor {
  return { blockId: blocks[0]?.id ?? '', charOffset: 0 };
}

function anchorForPage(blocks: readonly BlockLayout[], page: number): PageAnchor | null {
  for (const block of blocks) {
    const index = block.pages.findIndex((p) => p.page === page);
    if (index === -1) continue;
    if (index === 0) return { blockId: block.id, charOffset: 0 };
    const before = block.pages.slice(0, index).reduce((sum, p) => sum + p.height, 0);
    const fraction = block.totalHeight > 0 ? before / block.totalHeight : 0;
    return { blockId: block.id, charOffset: Math.round(fraction * block.chars) };
  }
  return null;
}

/** Página del capítulo que contiene una ubicación. Si el bloque no existe, la primera. */
export function locationToPage(layout: ChapterLayout, blockId: string, charOffset: number): number {
  const block = layout.byId.get(blockId);
  if (!block || block.pages.length === 0) return 0;
  const fraction = block.chars > 0 ? Math.min(1, Math.max(0, charOffset / block.chars)) : 0;
  const target = fraction * block.totalHeight;
  let accumulated = 0;
  for (const p of block.pages) {
    accumulated += p.height;
    if (target < accumulated - 0.5) return clampPage(layout, p.page);
  }
  return clampPage(layout, block.pages[block.pages.length - 1]?.page ?? 0);
}

function clampPage(layout: ChapterLayout, page: number): number {
  return Math.min(layout.pages - 1, Math.max(0, page));
}

export function pageAnchor(layout: ChapterLayout, page: number): PageAnchor {
  return layout.pageStarts[clampPage(layout, page)] ?? firstAnchor(layout.blocks);
}

/** Palabras del capítulo antes de una ubicación (para el porcentaje global). */
export function wordsBefore(layout: ChapterLayout, anchor: PageAnchor): number {
  const block = layout.byId.get(anchor.blockId);
  if (!block) return 0;
  const fraction = block.chars > 0 ? Math.min(1, anchor.charOffset / block.chars) : 0;
  return block.wordStart + fraction * block.words;
}

/** Clave de caché de layout: todo lo que cambia la paginación. */
export function layoutKey(parts: {
  fontFamily: string;
  fontScale: number;
  lineHeight: number;
  margins: string;
  justify: boolean;
  bold: boolean;
  codeWrap: boolean;
  codeScale: number;
  width: number;
  height: number;
}): string {
  return [
    parts.fontFamily,
    parts.fontScale.toFixed(2),
    parts.lineHeight.toFixed(2),
    parts.margins,
    parts.justify ? 'j' : 'l',
    parts.bold ? 'b' : 'n',
    parts.codeWrap ? 'w' : 's',
    parts.codeScale.toFixed(2),
    Math.round(parts.width),
    Math.round(parts.height),
  ].join('|');
}

/* ------------------------------------------------------------------ DOM ------------------- */

/** Mide los bloques de nivel superior de un capítulo ya dibujado en `flow` (sin trasladar). */
export function measureFlow(flow: HTMLElement): MeasuredBlock[] {
  const origin = flow.getBoundingClientRect();
  const article = flow.querySelector('article.chapter');
  if (!article) return [];
  const result: MeasuredBlock[] = [];
  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    const id = el.dataset.b;
    if (!id) continue;
    const rects = Array.from(el.getClientRects());
    const fragments = rects
      .filter((r) => r.width > 0 || r.height > 0)
      .map((r) => ({ left: r.left - origin.left, right: r.right - origin.left, height: r.height }));
    result.push({
      id,
      wordStart: Number(el.dataset.w ?? 0),
      chars: (el.textContent ?? '').length,
      fragments,
    });
  }
  return result;
}
