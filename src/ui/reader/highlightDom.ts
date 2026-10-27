/**
 * Parte DOM de los subrayados: convertir una selección en offsets de texto por bloque y pintar
 * `<mark class="hl">` sobre los nodos de texto. Las decisiones (reanclar, repartir rangos) son las
 * funciones puras de src/core/domain/highlights.ts.
 */

import type { Highlight } from '../../core/domain/annotations';
import { rangeSegments, resolveHighlight, trimRange } from '../../core/domain/highlights';
import type { SelectionPart } from '../stores/studyStore';

/** Bloques de nivel superior del capítulo (los únicos con `data-b`). */
export const BLOCK_SELECTOR = 'article.chapter > [data-b]';

/** Nodos de texto "legibles" de un bloque: fuera de SVG (diagramas), estilos y botones del lector. */
export function textNodesOf(block: Element): Text[] {
  const nodes: Text[] = [];
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('svg, style, script, .rd-expand, .b-code-lang')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

export function blockText(block: Element): string {
  return textNodesOf(block)
    .map((n) => n.data)
    .join('');
}

/** Offset de texto de un punto (nodo, offset) del DOM dentro del bloque. */
export function textOffset(
  block: Element,
  node: Node,
  offset: number,
  nodes = textNodesOf(block),
): number {
  const boundary = block.ownerDocument.createRange();
  try {
    boundary.setStart(node, offset);
  } catch {
    return 0;
  }
  boundary.collapse(true);
  let total = 0;
  for (const text of nodes) {
    if (text === node) return total + Math.min(offset, text.length);
    // El final del nodo queda antes (o justo en) el punto: el nodo entero cuenta.
    if (boundary.comparePoint(text, text.length) <= 0) {
      total += text.length;
      continue;
    }
    break;
  }
  return total;
}

/** Quita los subrayados pintados de un contenedor y vuelve a unir los nodos de texto. */
export function unwrapMarks(container: Element): void {
  const parents = new Set<Node>();
  for (const mark of container.querySelectorAll('mark.hl')) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parents.add(parent);
  }
  for (const parent of parents) parent.normalize();
}

/** Pinta un subrayado en su bloque si la cita sigue ahí. Devuelve false si quedó huérfano. */
export function paintHighlight(block: Element, highlight: Highlight): boolean {
  const nodes = textNodesOf(block);
  const text = nodes.map((n) => n.data).join('');
  const range = resolveHighlight(text, highlight);
  if (!range) return false;
  const segments = rangeSegments(
    nodes.map((n) => n.length),
    range.start,
    range.end,
  );
  for (const segment of segments) {
    const node = nodes[segment.index];
    if (!node) continue;
    let target: Text = node;
    if (segment.from > 0) target = target.splitText(segment.from);
    const length = segment.to - segment.from;
    if (length < target.length) target.splitText(length);
    const mark = block.ownerDocument.createElement('mark');
    mark.className = 'hl';
    mark.dataset.hl = highlight.id;
    mark.dataset.color = highlight.color;
    if (highlight.note) mark.dataset.note = 'true';
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
  }
  return segments.length > 0;
}

/**
 * Convierte la selección actual en fragmentos por bloque (una selección que cruza varios párrafos
 * produce un subrayado por párrafo). Solo cuenta lo que está dentro de `container`.
 */
export function selectionParts(selection: Selection, container: Element): SelectionPart[] {
  if (selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer))
    return [];
  const startBlock = closestBlock(range.startContainer);
  const endBlock = closestBlock(range.endContainer) ?? startBlock;
  if (!startBlock || !endBlock) return [];
  const article = startBlock.parentElement;
  if (!article) return [];
  const chapterId = article.dataset.chapter ?? '';
  const blocks: HTMLElement[] = [];
  let inside = false;
  for (const child of article.children) {
    if (!(child instanceof HTMLElement) || !child.dataset.b) continue;
    if (child === startBlock) inside = true;
    if (inside) blocks.push(child);
    if (child === endBlock) break;
  }
  const parts: SelectionPart[] = [];
  for (const block of blocks) {
    // Los encabezados de capítulo no se subrayan.
    if (block.classList.contains('ch-head')) continue;
    const nodes = textNodesOf(block);
    const text = nodes.map((n) => n.data).join('');
    const start =
      block === startBlock ? textOffset(block, range.startContainer, range.startOffset, nodes) : 0;
    const end =
      block === endBlock
        ? textOffset(block, range.endContainer, range.endOffset, nodes)
        : text.length;
    const trimmed = trimRange(text, { start, end });
    if (!trimmed) continue;
    parts.push({
      chapterId,
      blockId: block.dataset.b ?? '',
      start: trimmed.start,
      end: trimmed.end,
      quote: text.slice(trimmed.start, trimmed.end),
    });
  }
  return parts;
}

function closestBlock(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return (element?.closest(BLOCK_SELECTOR) as HTMLElement | null) ?? null;
}
