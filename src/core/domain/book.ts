import type { Location } from './location';
import { countWords } from './text';

/* ───────────────────────── Contenido en línea ───────────────────────── */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'delete'; children: Inline[] }
  | { type: 'code'; value: string }
  /** Enlace externo (http, mailto…). */
  | { type: 'link'; href: string; children: Inline[] }
  /** Enlace interno a un encabezado del propio libro. `target` es null si no resuelve. */
  | { type: 'anchor'; slug: string; target: Location | null; children: Inline[] }
  /** Referencia a un archivo del proyecto, ya relativa a la raíz del repositorio. */
  | {
      type: 'fileRef';
      path: string;
      line: number | null;
      lineEnd: number | null;
      href: string | null;
      children: Inline[];
    }
  | { type: 'image'; src: string; alt: string }
  | { type: 'break' };

/* ───────────────────────── Bloques ───────────────────────── */

export const CALLOUT_TONES = [
  'implementado',
  'interpretacion',
  'verificar',
  'evolucion',
  'limite',
  'matiz',
  'pregunta',
  'nota',
  'consejo',
  'aviso',
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export type Align = 'left' | 'right' | 'center' | null;

export interface ChecklistItem {
  id: string;
  checked: boolean;
  content: Inline[];
}

export type Block =
  | {
      kind: 'heading';
      id: string;
      level: 3 | 4 | 5 | 6;
      /** Numeración del MD ("5.4") separada del título, o null. */
      number: string | null;
      text: string;
      content: Inline[];
      /** Slug estilo GitHub, para resolver anclas `#…`. */
      slug: string;
      /** Id de sección si el encabezado abre una sección (H3). */
      sectionId: string | null;
    }
  | { kind: 'paragraph'; id: string; content: Inline[] }
  | { kind: 'callout'; id: string; tone: CalloutTone; label: string | null; content: Block[] }
  | { kind: 'code'; id: string; lang: string; code: string; html: string | null }
  | {
      kind: 'diagram';
      id: string;
      lang: 'mermaid';
      source: string;
      svg: { light: string; dark: string } | null;
    }
  | {
      kind: 'table';
      id: string;
      align: Align[];
      header: Inline[][];
      rows: Inline[][][];
      /** Tabla de glosario: fuente de los términos del libro. */
      glossary: boolean;
    }
  | { kind: 'list'; id: string; ordered: boolean; start: number | null; items: Block[][] }
  | { kind: 'checklist'; id: string; items: ChecklistItem[] }
  | {
      kind: 'question';
      id: string;
      number: number;
      /** Título del H3 que agrupa la pregunta (p. ej. "React e interfaz"). */
      group: string | null;
      question: Inline[];
      answer: Inline[];
    }
  /** Guion para decir en voz alta: párrafos entre comillas “…”. */
  | { kind: 'quote'; id: string; paragraphs: Inline[][] }
  | { kind: 'divider'; id: string };

export type BlockKind = Block['kind'];

/* ───────────────────────── Libro ───────────────────────── */

export interface Section {
  id: string;
  title: string;
  number: string | null;
  /** Id del bloque encabezado que abre la sección. */
  blockId: string;
  slug: string;
}

export interface Chapter {
  id: string;
  /** Número del MD (`## 5.`) o null para Introducción / capítulos sin número. */
  number: number | null;
  title: string;
  titleContent: Inline[];
  /** Slug estilo GitHub del H2 de origen (null en la Introducción sintética). */
  slug: string | null;
  sections: Section[];
  blocks: Block[];
}

export interface TocEntry {
  label: string;
  slug: string;
  target: Location | null;
}

export interface GlossaryTerm {
  id: string;
  /** Texto tal como aparece en el glosario ("SSR / SSG / CSR"). */
  term: string;
  aliases: string[];
  definition: Inline[];
  chapterId: string;
  blockId: string;
}

export interface Question {
  id: string;
  number: number;
  group: string | null;
  question: Inline[];
  answer: Inline[];
  chapterId: string;
  blockId: string;
}

export interface BookMeta {
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  repo: string | null;
  branch: string;
  color: string | null;
  sourceFile: string;
  updatedAt: string;
}

export interface Book extends BookMeta {
  chapters: Chapter[];
  /** Índice escrito a mano en el MD (si lo había), para validarlo contra los capítulos reales. */
  toc: TocEntry[];
}

/* ───────────────────────── Funciones puras ───────────────────────── */

export function inlineText(nodes: readonly Inline[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'code':
        out += node.value;
        break;
      case 'image':
        out += node.alt;
        break;
      case 'break':
        out += '\n';
        break;
      case 'fileRef':
        out += inlineText(node.children);
        break;
      default:
        out += inlineText(node.children);
    }
  }
  return out;
}

/** Texto plano de un bloque (incluye contenido anidado). */
export function blockText(block: Block): string {
  switch (block.kind) {
    case 'heading':
      return [block.number, inlineText(block.content)].filter(Boolean).join(' ');
    case 'paragraph':
      return inlineText(block.content);
    case 'callout':
      return [block.label, ...block.content.map(blockText)].filter(Boolean).join('\n');
    case 'code':
      return block.code;
    case 'diagram':
      return block.source;
    case 'table':
      return [block.header, ...block.rows]
        .map((row) => row.map((cell) => inlineText(cell)).join(' '))
        .join('\n');
    case 'list':
      return block.items.map((item) => item.map(blockText).join('\n')).join('\n');
    case 'checklist':
      return block.items.map((item) => inlineText(item.content)).join('\n');
    case 'question':
      return `${block.number}. ${inlineText(block.question)} ${inlineText(block.answer)}`;
    case 'quote':
      return block.paragraphs.map((p) => inlineText(p)).join('\n');
    case 'divider':
      return '';
  }
}

export function blockWords(block: Block): number {
  return countWords(blockText(block));
}

/** Recorre bloques en profundidad (incluye los anidados en listas y callouts). */
export function walkBlocks(blocks: readonly Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.kind === 'callout') walkBlocks(block.content, visit);
    if (block.kind === 'list') for (const item of block.items) walkBlocks(item, visit);
  }
}

/** Transforma bloques en profundidad sin mutar el original. */
export function mapBlocks(blocks: readonly Block[], fn: (block: Block) => Block): Block[] {
  return blocks.map((block) => {
    let next = block;
    if (next.kind === 'callout') next = { ...next, content: mapBlocks(next.content, fn) };
    if (next.kind === 'list') next = { ...next, items: next.items.map((i) => mapBlocks(i, fn)) };
    return fn(next);
  });
}

export async function mapBlocksAsync(
  blocks: readonly Block[],
  fn: (block: Block) => Promise<Block>,
): Promise<Block[]> {
  const out: Block[] = [];
  for (const block of blocks) {
    let next = block;
    if (next.kind === 'callout')
      next = { ...next, content: await mapBlocksAsync(next.content, fn) };
    if (next.kind === 'list') {
      const items: Block[][] = [];
      for (const item of next.items) items.push(await mapBlocksAsync(item, fn));
      next = { ...next, items };
    }
    out.push(await fn(next));
  }
  return out;
}

export async function mapBookBlocks(
  book: Book,
  fn: (block: Block, chapter: Chapter) => Promise<Block>,
): Promise<Book> {
  const chapters: Chapter[] = [];
  for (const chapter of book.chapters) {
    chapters.push({
      ...chapter,
      blocks: await mapBlocksAsync(chapter.blocks, (b) => fn(b, chapter)),
    });
  }
  return { ...book, chapters };
}

/** Recorre los nodos en línea de un bloque y sus hijos. */
export function walkInlines(nodes: readonly Inline[], visit: (node: Inline) => void): void {
  for (const node of nodes) {
    visit(node);
    if ('children' in node) walkInlines(node.children, visit);
  }
}

export function blockInlines(block: Block): Inline[][] {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return [block.content];
    case 'table':
      return [...block.header, ...block.rows.flat()];
    case 'checklist':
      return block.items.map((i) => i.content);
    case 'question':
      return [block.question, block.answer];
    case 'quote':
      return block.paragraphs;
    default:
      return [];
  }
}

/** Todas las preguntas del banco, en orden de lectura. */
export function collectQuestions(book: Book): Question[] {
  const questions: Question[] = [];
  for (const chapter of book.chapters) {
    walkBlocks(chapter.blocks, (block) => {
      if (block.kind !== 'question') return;
      questions.push({
        id: block.id,
        number: block.number,
        group: block.group,
        question: block.question,
        answer: block.answer,
        chapterId: chapter.id,
        blockId: block.id,
      });
    });
  }
  return questions;
}

/** Separa "SSR / SSG / CSR" en alias. */
export function splitAliases(term: string): string[] {
  return term
    .split(/\s+\/\s+/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

/** Glosario del libro a partir de las tablas marcadas como glosario. */
export function collectGlossary(book: Book): GlossaryTerm[] {
  const terms: GlossaryTerm[] = [];
  const used = new Set<string>();
  for (const chapter of book.chapters) {
    walkBlocks(chapter.blocks, (block) => {
      if (block.kind !== 'table' || !block.glossary) return;
      for (const row of block.rows) {
        const [termCell, ...definitionCells] = row;
        if (!termCell) continue;
        const term = inlineText(termCell).trim();
        if (!term) continue;
        let id = `t-${termKey(term)}`;
        for (let n = 2; used.has(id); n++) id = `t-${termKey(term)}-${n}`;
        used.add(id);
        terms.push({
          id,
          term,
          aliases: splitAliases(term),
          definition: definitionCells.flatMap((cell, i) =>
            i === 0 ? cell : [{ type: 'text', value: ' ' } as Inline, ...cell],
          ),
          chapterId: chapter.id,
          blockId: block.id,
        });
      }
    });
  }
  return terms;
}

function termKey(term: string): string {
  return (
    term
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'termino'
  );
}

export interface BookStats {
  chapters: number;
  blocks: Record<BlockKind, number>;
  questions: number;
  terms: number;
  fileRefs: number;
  anchors: number;
  externalLinks: number;
  words: number;
}

export function bookStats(book: Book): BookStats {
  const blocks = {
    heading: 0,
    paragraph: 0,
    callout: 0,
    code: 0,
    diagram: 0,
    table: 0,
    list: 0,
    checklist: 0,
    question: 0,
    quote: 0,
    divider: 0,
  } satisfies Record<BlockKind, number>;
  let fileRefs = 0;
  let anchors = 0;
  let externalLinks = 0;
  let total = 0;
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) total += blockWords(block);
    walkBlocks(chapter.blocks, (block) => {
      blocks[block.kind]++;
      for (const inlines of blockInlines(block)) {
        walkInlines(inlines, (node) => {
          if (node.type === 'fileRef') fileRefs++;
          if (node.type === 'anchor') anchors++;
          if (node.type === 'link') externalLinks++;
        });
      }
    });
  }
  return {
    chapters: book.chapters.length,
    blocks,
    questions: collectQuestions(book).length,
    terms: collectGlossary(book).length,
    fileRefs,
    anchors,
    externalLinks,
    words: total,
  };
}
