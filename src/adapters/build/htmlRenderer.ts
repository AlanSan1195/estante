import { type Block, type GlossaryTerm, type Inline, inlineText } from '../../core/domain/book';
import type { BookRenderer, ChapterRenderContext } from '../../core/ports/BookRenderer';

/**
 * Bloques de dominio → fragmento HTML de capítulo.
 *
 * Convenciones (contrato con el lector):
 * - `<article class="chapter" data-chapter data-words>` envuelve el capítulo.
 * - Cada bloque de nivel superior lleva `data-b="<blockId>"` y `data-w="<palabras previas en el capítulo>"`.
 * - La cabecera del capítulo es `header.ch-head` con `data-b="<chapterId>.head"`.
 * - Clases de bloque: b-p, b-h/b-section, b-callout[data-tone], b-code[data-lang], b-diagram,
 *   b-table[data-cols][data-layout=grid|cards] (celdas con data-label), b-list, b-checklist,
 *   qa (.qa-q/.qa-n/.qa-a), b-quote, b-divider.
 * - En línea: span.term[data-term], a.xref[data-chapter][data-block], .ref[data-ref], a.ext, code.c.
 */
export function createHtmlRenderer(): BookRenderer {
  return {
    renderChapter(chapter, context) {
      const terms = new TermMarker(context.glossary);
      const r = new ChapterWriter(context, terms);
      const label =
        context.label !== chapter.title
          ? `<p class="ch-label">${escapeHtml(context.label)}</p>`
          : '';
      const head = `<header class="ch-head" data-b="${attr(`${chapter.id}.head`)}" data-w="0">${label}<h1 class="ch-title">${r.inlines(chapter.titleContent, false)}</h1></header>`;
      const body = chapter.blocks.map((block) => r.block(block, true)).join('\n');
      return `<article class="chapter" data-chapter="${attr(chapter.id)}" data-words="${context.words}">\n${head}\n${body}\n</article>\n`;
    },
    renderInlines(nodes) {
      return new ChapterWriter(null, null).inlines(nodes, false);
    },
  };
}

/* ───────────────────────── Escritura de bloques ───────────────────────── */

class ChapterWriter {
  constructor(
    private readonly context: ChapterRenderContext | null,
    private readonly terms: TermMarker | null,
  ) {}

  private data(block: Block, top: boolean): string {
    if (!top || !this.context) return '';
    return ` data-b="${attr(block.id)}" data-w="${this.context.blockWordStart.get(block.id) ?? 0}"`;
  }

  block(block: Block, top = false): string {
    const data = this.data(block, top);
    switch (block.kind) {
      case 'heading': {
        const tag = block.level === 3 ? 'h2' : `h${block.level - 1}`;
        const cls = block.sectionId ? 'b-h b-section' : 'b-h';
        const section = block.sectionId ? ` data-section="${attr(block.sectionId)}"` : '';
        const number = block.number
          ? `<span class="b-h-num">${escapeHtml(block.number)}</span> `
          : '';
        return `<${tag} class="${cls}"${data}${section}>${number}${this.inlines(block.content, false)}</${tag}>`;
      }
      case 'paragraph':
        return `<p class="b-p"${data}>${this.inlines(block.content)}</p>`;
      case 'callout': {
        const label = block.label
          ? `<p class="b-callout-label">${escapeHtml(block.label)}</p>`
          : '';
        const body = block.content.map((b) => this.block(b)).join('');
        return `<aside class="b-callout" data-tone="${block.tone}"${data}>${label}<div class="b-callout-body">${body}</div></aside>`;
      }
      case 'code': {
        const html =
          block.html ?? `<pre class="shiki"><code>${escapeHtml(block.code)}</code></pre>`;
        const lines = block.code.split('\n').length;
        return `<figure class="b-code" data-lang="${attr(block.lang)}" data-lines="${lines}"${data}><figcaption class="b-code-lang">${escapeHtml(block.lang)}</figcaption>${html}</figure>`;
      }
      case 'diagram': {
        if (!block.svg) {
          return `<figure class="b-code" data-lang="mermaid"${data}><figcaption class="b-code-lang">mermaid</figcaption><pre class="shiki"><code>${escapeHtml(block.source)}</code></pre></figure>`;
        }
        return `<figure class="b-diagram" role="img" aria-label="Diagrama"${data}><div class="b-diagram-light">${block.svg.light}</div><div class="b-diagram-dark">${block.svg.dark}</div></figure>`;
      }
      case 'table': {
        const cols = block.header.length;
        const labels = block.header.map((cell) => attr(inlineText(cell).trim()));
        const mark = !block.glossary;
        const head = block.header
          .map((cell, i) => `<th${alignAttr(block.align[i])}>${this.inlines(cell, false)}</th>`)
          .join('');
        const rows = block.rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell, i) =>
                    `<td data-label="${labels[i] ?? ''}"${alignAttr(block.align[i])}>${this.inlines(cell, mark)}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('');
        const glossary = block.glossary ? ' data-glossary="true"' : '';
        return `<div class="b-table" data-cols="${cols}" data-layout="${cols >= 3 ? 'cards' : 'grid'}"${glossary}${data}><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const start =
          block.ordered && block.start !== null && block.start !== 1
            ? ` start="${block.start}"`
            : '';
        const items = block.items
          .map((item) => {
            const [only] = item;
            if (item.length === 1 && only?.kind === 'paragraph')
              return `<li>${this.inlines(only.content)}</li>`;
            return `<li>${item.map((b) => this.block(b)).join('')}</li>`;
          })
          .join('');
        return `<${tag} class="b-list"${start}${data}>${items}</${tag}>`;
      }
      case 'checklist': {
        const items = block.items
          .map(
            (item) =>
              `<li class="b-check" data-item="${attr(item.id)}"><label><input type="checkbox" data-check="${attr(item.id)}"${item.checked ? ' checked' : ''}><span>${this.inlines(item.content)}</span></label></li>`,
          )
          .join('');
        return `<ul class="b-checklist"${data}>${items}</ul>`;
      }
      case 'question': {
        const group = block.group ? ` data-group="${attr(block.group)}"` : '';
        return `<section class="qa" data-q="${attr(block.id)}"${group}${data}><p class="qa-q"><span class="qa-n">${block.number}.</span> ${this.inlines(block.question, false)}</p><div class="qa-a"><p>${this.inlines(block.answer)}</p></div></section>`;
      }
      case 'quote':
        return `<blockquote class="b-quote"${data}>${block.paragraphs.map((p) => `<p>${this.inlines(p)}</p>`).join('')}</blockquote>`;
      case 'divider':
        return `<hr class="b-divider"${data}>`;
    }
  }

  /** `mark` decide si se buscan términos del glosario en el texto. */
  inlines(nodes: readonly Inline[], mark = true): string {
    let out = '';
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          out += mark && this.terms ? this.terms.mark(node.value) : escapeHtml(node.value);
          break;
        case 'strong':
          out += `<strong>${this.inlines(node.children, mark)}</strong>`;
          break;
        case 'emphasis':
          out += `<em>${this.inlines(node.children, mark)}</em>`;
          break;
        case 'delete':
          out += `<del>${this.inlines(node.children, mark)}</del>`;
          break;
        case 'code':
          out += `<code class="c">${escapeHtml(node.value)}</code>`;
          break;
        case 'break':
          out += '<br>';
          break;
        case 'image':
          out += /^https?:\/\//.test(node.src)
            ? `<img class="b-img" src="${attr(node.src)}" alt="${attr(node.alt)}" loading="lazy">`
            : `<span class="img-missing">[imagen: ${escapeHtml(node.alt)}]</span>`;
          break;
        case 'link':
          out += `<a class="ext" href="${attr(node.href)}" target="_blank" rel="noopener noreferrer">${this.inlines(node.children, false)}</a>`;
          break;
        case 'anchor':
          out += node.target
            ? `<a class="xref" href="#${attr(`${node.target.chapterId}/${node.target.blockId}`)}" data-chapter="${attr(node.target.chapterId)}" data-block="${attr(node.target.blockId)}">${this.inlines(node.children, false)}</a>`
            : `<span class="xref xref-broken" data-slug="${attr(node.slug)}">${this.inlines(node.children, false)}</span>`;
          break;
        case 'fileRef': {
          const root = this.context ? `${this.context.book.slug}/` : '/';
          const path = node.path === '/' ? root : node.path;
          const line = node.line ? `:${node.line}${node.lineEnd ? `–${node.lineEnd}` : ''}` : '';
          const ref = `${path}${line}`;
          const title = inlineText(node.children);
          const inner = `<span class="ref-path">${escapeHtml(path)}</span>${line ? `<span class="ref-line">${escapeHtml(line)}</span>` : ''}`;
          out += node.href
            ? `<a class="ref" data-ref="${attr(ref)}" title="${attr(title)}" href="${attr(node.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
            : `<span class="ref" data-ref="${attr(ref)}" title="${attr(title)}">${inner}</span>`;
          break;
        }
      }
    }
    return out;
  }
}

/* ───────────────────────── Glosario en el texto ───────────────────────── */

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAcronym(alias: string): boolean {
  return /[A-Z]/.test(alias) && alias === alias.toUpperCase();
}

/**
 * Marca la PRIMERA aparición de cada término por capítulo. Los acrónimos (SSE, TTL) se buscan
 * respetando mayúsculas; el resto, sin distinguirlas.
 */
class TermMarker {
  private readonly marked = new Set<string>();
  private readonly sensitive: RegExp | null;
  private readonly insensitive: RegExp | null;
  private readonly exact = new Map<string, string>();
  private readonly folded = new Map<string, string>();

  constructor(glossary: readonly GlossaryTerm[]) {
    const sensitive: string[] = [];
    const insensitive: string[] = [];
    for (const term of glossary) {
      for (const alias of term.aliases) {
        if (alias.length < 2) continue;
        if (isAcronym(alias)) {
          if (!this.exact.has(alias)) this.exact.set(alias, term.id);
          sensitive.push(alias);
        } else {
          const key = alias.toLocaleLowerCase('es');
          if (!this.folded.has(key)) this.folded.set(key, term.id);
          insensitive.push(alias);
        }
      }
    }
    const build = (list: string[], flags: string) =>
      list.length === 0
        ? null
        : new RegExp(
            `${BOUNDARY_BEFORE}(${[...new Set(list)]
              .sort((a, b) => b.length - a.length)
              .map(escapeRegex)
              .join('|')})${BOUNDARY_AFTER}`,
            flags,
          );
    this.sensitive = build(sensitive, 'gu');
    this.insensitive = build(insensitive, 'giu');
  }

  mark(text: string): string {
    if (!this.sensitive && !this.insensitive) return escapeHtml(text);
    const hits: { start: number; end: number; id: string }[] = [];
    const collect = (regex: RegExp | null, resolve: (m: string) => string | undefined) => {
      if (!regex) return;
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        const id = resolve(match[0]);
        if (id && match.index !== undefined)
          hits.push({ start: match.index, end: match.index + match[0].length, id });
      }
    };
    collect(this.sensitive, (m) => this.exact.get(m));
    collect(this.insensitive, (m) => this.folded.get(m.toLocaleLowerCase('es')));
    hits.sort((a, b) => a.start - b.start || b.end - a.end);

    let out = '';
    let cursor = 0;
    for (const hit of hits) {
      if (hit.start < cursor || this.marked.has(hit.id)) continue;
      this.marked.add(hit.id);
      out += escapeHtml(text.slice(cursor, hit.start));
      out += `<span class="term" data-term="${attr(hit.id)}">${escapeHtml(text.slice(hit.start, hit.end))}</span>`;
      cursor = hit.end;
    }
    return out + escapeHtml(text.slice(cursor));
  }
}

/* ───────────────────────── Escape ───────────────────────── */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function alignAttr(align: string | null | undefined): string {
  return align ? ` data-align="${align}"` : '';
}
