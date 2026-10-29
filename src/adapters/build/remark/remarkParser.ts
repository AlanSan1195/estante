import GithubSlugger from 'github-slugger';
import type {
  Blockquote,
  Code,
  Heading,
  List,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
} from 'mdast';
import { toString as mdToString } from 'mdast-util-to-string';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import YAML from 'yaml';
import type {
  Align,
  Block,
  Book,
  CalloutTone,
  Chapter,
  Inline,
  Section,
  TocEntry,
} from '../../../core/domain/book';
import { inlineText } from '../../../core/domain/book';
import type { Location } from '../../../core/domain/location';
import { capitalize, createIdSlugger } from '../../../core/domain/text';
import { type BuildWarning, warning } from '../../../core/domain/warnings';
import type { DocumentParser, ParseResult } from '../../../core/ports/DocumentParser';
import type { SourceDocument } from '../../../core/ports/ProjectSource';
import {
  detectProjectRoot,
  isExternal,
  isLocalAbsolute,
  normalizeRepo,
  parseRef,
  relativeToRoot,
  repoHref,
} from './fileRefs';
import {
  type CalloutRule,
  DEFAULT_CALLOUT_RULES,
  GITHUB_ALERT_TONES,
  GLOSSARY_HEADING,
  TOC_HEADING,
} from './rules';

export interface RemarkParserOptions {
  calloutRules?: CalloutRule[];
  defaultAuthor?: string;
}

const INTRO_ID = 'introduccion';
const CHAPTER_NUMBER = /^\s*(\d+)\.\s+/;
const SECTION_NUMBER = /^\s*(\d+(?:\.\d+)+)\.?\s+|^\s*(\d+)\.\s+/;
const QUESTION = /^\s*(\d+)\.\s+([\s\S]*\?)\s*$/;
const QUOTED_QUESTION = /^\s*["“][\s\S]+["”]\s*$/;
const QUESTIONS_HEADING = /pregunta/i;

interface ChapterDraft {
  number: number | null;
  title: string;
  titleContent: Inline[];
  heading: Heading | null;
  nodes: RootContent[];
  /** Capítulo sintético (Introducción). */
  intro: boolean;
}

/** Contexto mutable de una pasada de parseo de un documento. */
interface ParseContext {
  slug: string;
  repo: string | null;
  branch: string;
  root: string | null;
  headingSlugs: Map<Heading, string>;
  anchorTargets: Map<string, Location>;
  pendingAnchors: Extract<Inline, { type: 'anchor' }>[];
  toc: TocEntry[];
  calloutRules: CalloutRule[];
}

interface ChapterContext {
  chapterId: string;
  sectionKey: string;
  index: number;
  sectionSlugger: (text: string) => string;
  sections: Section[];
  lastHeadingText: string;
  sectionTitle: string | null;
  chapterTitle: string;
  /** Preguntas sin número (`**"¿…?"**`) vistas en la sección actual: numeran las siguientes. */
  quotedQuestions: number;
  /** Dentro de la sección de índice manual: las listas de anclas se descartan. */
  inToc: boolean;
}

export function createRemarkParser(options: RemarkParserOptions = {}): DocumentParser {
  const calloutRules = options.calloutRules ?? DEFAULT_CALLOUT_RULES;
  const defaultAuthor = options.defaultAuthor ?? 'Alan Sandoval';
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);

  return {
    parse(source: SourceDocument): ParseResult {
      const tree = processor.parse(source.markdown) as Root;
      const warnings: BuildWarning[] = [];
      const frontmatter = readFrontmatter(tree);

      const ctx: ParseContext = {
        slug: source.slug,
        repo: normalizeRepo(frontmatter.repo),
        branch: typeof frontmatter.branch === 'string' ? frontmatter.branch : 'main',
        root:
          typeof frontmatter.root === 'string'
            ? frontmatter.root.replace(/\/+$/, '')
            : detectProjectRoot(collectLocalPaths(tree), source.slug),
        headingSlugs: slugHeadings(tree),
        anchorTargets: new Map(),
        pendingAnchors: [],
        toc: [],
        calloutRules,
      };

      // Título del libro: frontmatter → primer H1 → nombre del archivo.
      const h1 = tree.children.find((n): n is Heading => n.type === 'heading' && n.depth === 1);
      const rawTitle =
        (typeof frontmatter.title === 'string' && frontmatter.title) ||
        (h1 ? mdToString(h1) : '') ||
        source.slug;
      if (!h1 && typeof frontmatter.title !== 'string') {
        warnings.push(
          warning('no-title', source.slug, 'El MD no tiene H1; se usa el nombre del archivo.'),
        );
      }
      const [title, splitSubtitle] = splitTitle(rawTitle);
      const subtitle =
        typeof frontmatter.subtitle === 'string' ? frontmatter.subtitle : splitSubtitle;

      const drafts = splitChapters(tree, h1 ?? null);
      const chapterSlugger = createIdSlugger(32);
      const chapters: Chapter[] = [];
      if (drafts.some((d) => d.intro)) chapterSlugger(INTRO_ID);
      for (const draft of drafts) {
        const chapterId = draft.intro ? INTRO_ID : chapterSlugger(draft.title);
        const chapter = buildChapter(draft, chapterId, ctx);
        // Una Introducción que solo contenía el índice manual no se publica como capítulo.
        if (draft.intro && chapter.blocks.every((b) => b.kind === 'divider')) continue;
        chapters.push(chapter);
      }

      // Destinos de anclas: H1 → inicio del libro; H2 → cabecera del capítulo.
      const first = chapters[0];
      if (h1 && first) {
        const slug = ctx.headingSlugs.get(h1);
        if (slug) ctx.anchorTargets.set(slug, headLocation(first.id));
      }
      for (const anchor of ctx.pendingAnchors)
        anchor.target = ctx.anchorTargets.get(anchor.slug) ?? null;
      for (const entry of ctx.toc) entry.target = ctx.anchorTargets.get(entry.slug) ?? null;

      const book: Book = {
        slug: source.slug,
        title,
        subtitle,
        author: typeof frontmatter.author === 'string' ? frontmatter.author : defaultAuthor,
        repo: ctx.repo,
        branch: ctx.branch,
        color: typeof frontmatter.color === 'string' ? frontmatter.color : null,
        sourceFile: source.fileName,
        updatedAt: source.updatedAt,
        chapters,
        toc: ctx.toc,
      };
      return { book, warnings };
    },
  };
}

/* ───────────────────────── Estructura del documento ───────────────────────── */

function readFrontmatter(tree: Root): Record<string, unknown> {
  const node = tree.children[0];
  if (node?.type !== 'yaml') return {};
  try {
    const value = YAML.parse(node.value);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Separa "Proyecto: subtítulo" o "Proyecto — subtítulo" por el primer separador. */
function splitTitle(raw: string): [string, string | null] {
  const separator = raw.match(/:|\s[—–]\s/);
  const index = separator?.index ?? -1;
  if (!separator || index <= 0) return [raw.trim(), null];
  const title = raw.slice(0, index).trim();
  const subtitle = raw.slice(index + separator[0].length).trim();
  return [title, subtitle ? capitalize(subtitle) : null];
}

/** Slugs estilo GitHub de todos los encabezados, en orden del documento (como los genera GitHub). */
function slugHeadings(tree: Root): Map<Heading, string> {
  const slugger = new GithubSlugger();
  const map = new Map<Heading, string>();
  visit(tree, (node) => {
    if (node.type === 'heading') map.set(node, slugger.slug(mdToString(node)));
  });
  return map;
}

function collectLocalPaths(tree: Root): string[] {
  const paths: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'link' && isLocalAbsolute(node.url)) paths.push(parseRef(node.url).path);
  });
  return paths;
}

function visit(node: Nodes, fn: (node: Nodes) => void): void {
  fn(node);
  if ('children' in node) for (const child of node.children as Nodes[]) visit(child, fn);
}

/**
 * Divide el documento en capítulos:
 * - lo previo al primer H2 (sin el H1) → Introducción;
 * - un H2 de índice ("Índice de estudio") antes del primer capítulo se suma a la Introducción;
 * - cada H2 (o H1 adicional) abre un capítulo; `## N.` le da número.
 */
function splitChapters(tree: Root, h1: Heading | null): ChapterDraft[] {
  const drafts: ChapterDraft[] = [];
  const intro: ChapterDraft = {
    number: null,
    title: 'Introducción',
    titleContent: [{ type: 'text', value: 'Introducción' }],
    heading: null,
    nodes: [],
    intro: true,
  };
  let current: ChapterDraft = intro;
  let seenChapter = false;

  for (const node of tree.children) {
    if (node.type === 'yaml' || node === h1) continue;
    const opensChapter = node.type === 'heading' && (node.depth === 2 || node.depth === 1);
    if (opensChapter) {
      const text = mdToString(node);
      if (!seenChapter && TOC_HEADING.test(text)) {
        // El índice manual se integra en la Introducción, marcado para descartar su lista de anclas.
        intro.nodes.push(node);
        current = intro;
        continue;
      }
      seenChapter = true;
      const match = text.match(CHAPTER_NUMBER);
      const titleContent = stripPrefix(convertHeadingInlines(node), CHAPTER_NUMBER);
      current = {
        number: match ? Number(match[1]) : null,
        title: inlineText(titleContent).trim(),
        titleContent,
        heading: node,
        nodes: [],
        intro: false,
      };
      drafts.push(current);
      continue;
    }
    current.nodes.push(node);
  }

  return intro.nodes.length > 0 ? [intro, ...drafts] : drafts;
}

/** Las anclas de títulos de capítulo se convierten sin contexto (no hay enlaces en títulos). */
function convertHeadingInlines(node: Heading): Inline[] {
  return node.children.flatMap((child) => simpleInline(child));
}

function simpleInline(node: PhrasingContent): Inline[] {
  switch (node.type) {
    case 'text':
      return [{ type: 'text', value: node.value }];
    case 'inlineCode':
      return [{ type: 'code', value: node.value }];
    case 'strong':
    case 'emphasis':
    case 'delete':
      return [{ type: node.type, children: node.children.flatMap(simpleInline) }];
    default:
      return [{ type: 'text', value: mdToString(node) }];
  }
}

function stripPrefix(nodes: Inline[], pattern: RegExp): Inline[] {
  const [first, ...rest] = nodes;
  if (first?.type !== 'text') return nodes;
  const value = first.value.replace(pattern, '');
  return value ? [{ type: 'text', value }, ...rest] : rest;
}

/** Quita las comillas que envuelven un texto en línea: `"¿Pregunta?"` → `¿Pregunta?`. */
function unquote(nodes: Inline[]): Inline[] {
  const out = stripPrefix(nodes, /^\s*["“]/);
  const last = out.at(-1);
  if (last?.type !== 'text') return out;
  const value = last.value.replace(/["”]\s*$/, '');
  return value ? [...out.slice(0, -1), { type: 'text', value }] : out.slice(0, -1);
}

function headLocation(chapterId: string): Location {
  return { chapterId, blockId: `${chapterId}.head`, charOffset: 0 };
}

/* ───────────────────────── Capítulos y bloques ───────────────────────── */

function buildChapter(draft: ChapterDraft, chapterId: string, ctx: ParseContext): Chapter {
  const chapterSlug = draft.heading ? (ctx.headingSlugs.get(draft.heading) ?? null) : null;
  if (chapterSlug) ctx.anchorTargets.set(chapterSlug, headLocation(chapterId));

  const cc: ChapterContext = {
    chapterId,
    sectionKey: '_',
    index: 0,
    sectionSlugger: createIdSlugger(32),
    sections: [],
    lastHeadingText: draft.title,
    sectionTitle: null,
    chapterTitle: draft.title,
    quotedQuestions: 0,
    inToc: false,
  };
  const blocks = convertSequence(
    draft.nodes,
    ctx,
    cc,
    () => `${cc.chapterId}.${cc.sectionKey}.${cc.index++}`,
  );
  return {
    id: chapterId,
    number: draft.number,
    title: draft.title,
    titleContent: draft.titleContent,
    slug: chapterSlug,
    sections: cc.sections,
    blocks,
  };
}

/**
 * Convierte una secuencia de nodos hermanos. Recibe un generador de ids para que el mismo código
 * sirva para el nivel superior (ids por sección) y para contenido anidado (ids por prefijo).
 */
function convertSequence(
  nodes: readonly RootContent[],
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
  topLevel = true,
): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as RootContent;

    // Guion entre comillas: agrupa párrafos desde “… hasta …”.
    if (node.type === 'paragraph' && startsQuote(node)) {
      const group: Paragraph[] = [node];
      let j = i;
      while (!endsQuote(group.at(-1) as Paragraph)) {
        const next = nodes[j + 1];
        if (next?.type !== 'paragraph') break;
        group.push(next);
        j++;
      }
      blocks.push({
        kind: 'quote',
        id: nextId(),
        paragraphs: group.map((p) => convertInlines(p.children, ctx)),
      });
      i = j;
      continue;
    }

    blocks.push(...convertNode(node, ctx, cc, nextId, topLevel));
  }
  return blocks;
}

function convertNode(
  node: RootContent,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
  topLevel: boolean,
): Block[] {
  switch (node.type) {
    case 'heading':
      return [convertHeading(node, ctx, cc, nextId, topLevel)];
    case 'paragraph':
      return convertParagraph(node, ctx, cc, nextId);
    case 'code':
      return [convertCode(node, nextId)];
    case 'table':
      return [convertTable(node, ctx, cc, nextId)];
    case 'list':
      return convertList(node, ctx, cc, nextId);
    case 'blockquote':
      return [convertBlockquote(node, ctx, cc, nextId)];
    case 'thematicBreak':
      return [{ kind: 'divider', id: nextId() }];
    case 'html':
      return node.value.trim()
        ? [{ kind: 'paragraph', id: nextId(), content: [{ type: 'text', value: node.value }] }]
        : [];
    case 'footnoteDefinition': {
      const id = nextId();
      let n = 0;
      return [
        {
          kind: 'callout',
          id,
          tone: 'nota',
          label: `[${node.label ?? node.identifier}]`,
          content: convertSequence(node.children, ctx, cc, () => `${id}.${n++}`, false),
        },
      ];
    }
    case 'yaml':
    case 'definition':
      return [];
    default:
      return [];
  }
}

function convertHeading(
  node: Heading,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
  topLevel: boolean,
): Block {
  const text = mdToString(node);
  const slug = ctx.headingSlugs.get(node) ?? '';
  cc.lastHeadingText = text;

  if (TOC_HEADING.test(text) && node.depth <= 2) {
    // Encabezado de índice manual dentro de la Introducción: no se muestra, pero su ancla apunta aquí.
    cc.inToc = true;
    const blockId = nextId();
    if (slug) ctx.anchorTargets.set(slug, { chapterId: cc.chapterId, blockId, charOffset: 0 });
    return { kind: 'divider', id: blockId };
  }

  const isSection = topLevel && node.depth <= 3;
  const match = text.match(SECTION_NUMBER);
  const number = match ? (match[1] ?? match[2] ?? null) : null;
  const content = stripPrefix(convertInlines(node.children, ctx), SECTION_NUMBER);
  const plain = inlineText(content).trim();
  let sectionId: string | null = null;
  if (isSection) {
    cc.inToc = false;
    sectionId = cc.sectionSlugger(plain);
    cc.sectionKey = sectionId;
    cc.index = 0;
    cc.sectionTitle = plain;
    cc.quotedQuestions = 0;
  }
  const id = nextId();
  if (sectionId) cc.sections.push({ id: sectionId, title: plain, number, blockId: id, slug });
  if (slug) ctx.anchorTargets.set(slug, { chapterId: cc.chapterId, blockId: id, charOffset: 0 });
  const level = (
    isSection ? 3 : Math.min(6, Math.max(4, node.depth + (node.depth <= 3 ? 1 : 0)))
  ) as 3 | 4 | 5 | 6;
  return { kind: 'heading', id, level, number, text: plain, content, slug, sectionId };
}

function convertParagraph(
  node: Paragraph,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
): Block[] {
  const children = node.children;
  if (children.every((c) => c.type === 'text' && c.value.trim() === '')) return [];
  const [first, ...rest] = children;

  if (first?.type === 'strong') {
    const label = mdToString(first).trim();

    // Banco de preguntas: **12. ¿Pregunta?** Respuesta
    const question = label.match(QUESTION);
    if (question) {
      return [
        {
          kind: 'question',
          id: nextId(),
          number: Number(question[1]),
          group: cc.sectionTitle,
          question: stripPrefix(convertInlines(first.children, ctx), /^\s*\d+\.\s+/),
          answer: trimStart(convertInlines(rest, ctx)),
        },
      ];
    }

    // Pregunta de entrevista sin número, en una sección de preguntas: **"¿Pregunta?"** Respuesta
    const inQuestions =
      QUESTIONS_HEADING.test(cc.sectionTitle ?? '') || QUESTIONS_HEADING.test(cc.chapterTitle);
    const answer =
      inQuestions && QUOTED_QUESTION.test(label) ? trimStart(convertInlines(rest, ctx)) : [];
    if (inlineText(answer).trim() !== '') {
      return [
        {
          kind: 'question',
          id: nextId(),
          number: ++cc.quotedQuestions,
          group: cc.sectionTitle,
          question: unquote(convertInlines(first.children, ctx)),
          answer,
        },
      ];
    }

    // Callout: **Interpretación técnica:** texto
    const rule = label.length <= 60 ? ctx.calloutRules.find((r) => r.match.test(label)) : undefined;
    if (rule) {
      const id = nextId();
      return [
        {
          kind: 'callout',
          id,
          tone: rule.tone,
          label: label.replace(/[:.]\s*$/, ''),
          content: [
            { kind: 'paragraph', id: `${id}.0`, content: trimStart(convertInlines(rest, ctx)) },
          ],
        },
      ];
    }
  }

  return [{ kind: 'paragraph', id: nextId(), content: convertInlines(children, ctx) }];
}

function convertCode(node: Code, nextId: () => string): Block {
  const lang = (node.lang ?? 'text').toLowerCase();
  if (lang === 'mermaid')
    return { kind: 'diagram', id: nextId(), lang: 'mermaid', source: node.value, svg: null };
  return { kind: 'code', id: nextId(), lang, code: node.value, html: null };
}

function convertTable(
  node: Table,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
): Block {
  const [headerRow, ...bodyRows] = node.children;
  const toCells = (row: Table['children'][number] | undefined) =>
    (row?.children ?? []).map((cell) => convertInlines(cell.children, ctx));
  const header = toCells(headerRow);
  return {
    kind: 'table',
    id: nextId(),
    align: (node.align ?? []).map((a) => (a ?? null) as Align),
    header,
    rows: bodyRows.map(toCells),
    glossary: GLOSSARY_HEADING.test(cc.lastHeadingText) && header.length >= 2,
  };
}

function convertList(
  node: List,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
): Block[] {
  if (cc.inToc && isAnchorList(node)) {
    for (const item of node.children) {
      const paragraph = item.children[0] as Paragraph;
      const link = paragraph.children.find((c) => c.type === 'link');
      if (link?.type === 'link') {
        ctx.toc.push({ label: mdToString(link), slug: decodeSlug(link.url), target: null });
      }
    }
    return [];
  }

  const id = nextId();
  const isChecklist =
    node.children.length > 0 && node.children.every((item) => typeof item.checked === 'boolean');
  if (isChecklist) {
    return [
      {
        kind: 'checklist',
        id,
        items: node.children.map((item, i) => ({
          id: `${id}.${i}`,
          checked: item.checked === true,
          content: item.children.flatMap((child) =>
            child.type === 'paragraph'
              ? convertInlines(child.children, ctx)
              : [{ type: 'text', value: mdToString(child) } as Inline],
          ),
        })),
      },
    ];
  }

  return [
    {
      kind: 'list',
      id,
      ordered: node.ordered === true,
      start: node.ordered ? (node.start ?? 1) : null,
      items: node.children.map((item, i) => {
        let n = 0;
        return convertSequence(item.children, ctx, cc, () => `${id}.${i}.${n++}`, false);
      }),
    },
  ];
}

function convertBlockquote(
  node: Blockquote,
  ctx: ParseContext,
  cc: ChapterContext,
  nextId: () => string,
): Block {
  const id = nextId();
  let tone: CalloutTone = 'aviso';
  let label: string | null = null;
  const children = [...node.children];
  const firstParagraph = children[0]?.type === 'paragraph' ? (children[0] as Paragraph) : null;

  if (firstParagraph) {
    const head = firstParagraph.children[0];
    // Alerta estilo GitHub: > [!WARNING]
    if (head?.type === 'text') {
      const alert = head.value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
      if (alert?.[1]) {
        tone = GITHUB_ALERT_TONES[alert[1]] ?? 'aviso';
        const remaining = head.value.slice(alert[0].length);
        children[0] = {
          ...firstParagraph,
          children: remaining
            ? [{ ...head, value: remaining }, ...firstParagraph.children.slice(1)]
            : firstParagraph.children.slice(1),
        };
      }
    }
    // Etiqueta en negrita al inicio: > **Alcance de la evidencia.** …
    const current = children[0] as Paragraph;
    const strong = current.children[0];
    if (strong?.type === 'strong') {
      const text = mdToString(strong).trim();
      if (text.length <= 60) {
        label = text.replace(/[:.]\s*$/, '');
        children[0] = { ...current, children: trimStartMd(current.children.slice(1)) };
      }
    }
  }

  let n = 0;
  return {
    kind: 'callout',
    id,
    tone,
    label,
    content: convertSequence(children as RootContent[], ctx, cc, () => `${id}.${n++}`, false),
  };
}

/* ───────────────────────── Contenido en línea ───────────────────────── */

function convertInlines(nodes: readonly PhrasingContent[], ctx: ParseContext): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push({ type: 'text', value: node.value });
        break;
      case 'inlineCode':
        out.push({ type: 'code', value: node.value });
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
        out.push({ type: node.type, children: convertInlines(node.children, ctx) });
        break;
      case 'break':
        out.push({ type: 'break' });
        break;
      case 'image':
        out.push({ type: 'image', src: node.url, alt: node.alt ?? '' });
        break;
      case 'link':
        out.push(convertLink(node.url, convertInlines(node.children, ctx), ctx));
        break;
      case 'html':
        out.push({ type: 'text', value: node.value });
        break;
      default:
        out.push({ type: 'text', value: mdToString(node) });
    }
  }
  return out;
}

function convertLink(url: string, children: Inline[], ctx: ParseContext): Inline {
  if (url.startsWith('#')) {
    const anchor: Extract<Inline, { type: 'anchor' }> = {
      type: 'anchor',
      slug: decodeSlug(url),
      target: null,
      children,
    };
    ctx.pendingAnchors.push(anchor);
    return anchor;
  }
  if (isExternal(url)) return { type: 'link', href: url, children };

  const ref = parseRef(url);
  const path = isLocalAbsolute(url)
    ? relativeToRoot(ref.path, ctx.root)
    : ref.path.replace(/^\.\//, '');
  return {
    type: 'fileRef',
    path,
    line: ref.line,
    lineEnd: ref.lineEnd,
    href: repoHref(ctx.repo, ctx.branch, path, ref.line, ref.lineEnd),
    children,
  };
}

/* ───────────────────────── Ayudantes ───────────────────────── */

function decodeSlug(url: string): string {
  const raw = url.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Lista cuyo único contenido por ítem es un enlace ancla (más puntuación): un índice manual. */
function isAnchorList(node: List): boolean {
  return (
    node.children.length > 0 &&
    node.children.every((item) => {
      if (item.children.length !== 1 || item.children[0]?.type !== 'paragraph') return false;
      const parts = item.children[0].children;
      const links = parts.filter((p) => p.type === 'link');
      const others = parts.filter((p) => p.type !== 'link');
      return (
        links.length === 1 &&
        links[0]?.type === 'link' &&
        links[0].url.startsWith('#') &&
        others.every((p) => p.type === 'text' && /^[\s.,;:·–—-]*$/.test(p.value))
      );
    })
  );
}

/** El guion es texto plano entre comillas; `**“¿Pregunta?”** respuesta` no lo es. */
function startsQuote(node: Paragraph): boolean {
  return node.children[0]?.type === 'text' && /^\s*“/.test(mdToString(node));
}

function endsQuote(node: Paragraph): boolean {
  return /”[.!?…]?\s*$/.test(mdToString(node));
}

function trimStart(nodes: Inline[]): Inline[] {
  const [first, ...rest] = nodes;
  if (first?.type !== 'text') return nodes;
  const value = first.value.replace(/^\s+/, '');
  return value ? [{ type: 'text', value }, ...rest] : rest;
}

function trimStartMd(nodes: PhrasingContent[]): PhrasingContent[] {
  const [first, ...rest] = nodes;
  if (first?.type !== 'text') return nodes;
  const value = first.value.replace(/^\s+/, '');
  return value ? [{ ...first, value }, ...rest] : rest;
}
