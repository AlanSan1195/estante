/**
 * Motor de lectura: pagina, pasa páginas (curl, deslizar o desplazamiento continuo) y traduce
 * entre páginas y ubicaciones estables. Es TypeScript puro: React solo escucha sus eventos y pinta
 * los controles; ningún cuadro de animación pasa por React.
 *
 *   const engine = createReaderEngine({ root, surface, slug, manifest, prefs, initialLocation });
 *   engine.on('location', (position) => …);
 *   engine.next(); engine.goTo(location, { recordJump: true });
 */

import type { Location } from '../core/domain/location';
import { percentFromWordOffset } from '../core/domain/location';
import type { ReaderPreferences } from '../core/domain/preferences';
import type { BookManifest } from '../core/domain/published';
import { type ChapterFetcher, ChapterStore } from './chapterStore';
import { CurlRenderer } from './curlRenderer';
import { GestureController, shouldCompleteTurn } from './gestures';
import { FlapLayer, Measurer, PageLayer } from './layers';
import { chapterStarts, locateGlobalPage, PageCounter } from './pageCount';
import {
  anchorCorner,
  autoTurnPoint,
  type Corner,
  clamp,
  computeFold,
  cornerPoint,
  dragPoint,
  followPoint,
  type Point,
  turnedPoint,
  turnProgress,
} from './pageCurl';
import {
  buildChapterLayout,
  type ChapterLayout,
  layoutKey,
  locationToPage,
  measureFlow,
  type PageAnchor,
  pageAnchor,
  wordsBefore,
} from './paginator';
import { ScrollView } from './scrollView';
import { SlideRenderer } from './slide';
import { animateSpring2D, animateTimed, type SpringAnimation, type TimedAnimation } from './spring';
import type {
  ChapterDecorator,
  PageCountCache,
  PagesInfo,
  ReaderEventName,
  ReaderEvents,
  ReaderPosition,
  ViewerRequest,
} from './types';
import { Emitter } from './types';
import {
  applyPreferences,
  MARGIN_PX,
  prefersReducedMotion,
  themeLayout,
  waitForFonts,
} from './typography';

export interface ReaderEngineOptions {
  /** Recibe atributos de tema y variables tipográficas (también la usa el chrome). */
  root: HTMLElement;
  /** Superficie propia del motor: React nunca dibuja dentro. */
  surface: HTMLElement;
  slug: string;
  manifest: BookManifest;
  prefs: ReaderPreferences;
  initialLocation: Location | null;
  pageCountCache?: PageCountCache;
  fetchChapter?: ChapterFetcher;
  /** Decora cada copia de un capítulo al inyectarla (subrayados, checklists, respuestas). */
  decorate?: ChapterDecorator;
  /**
   * Franja (px) del borde izquierdo de la pantalla sin arrastre: en Safari iOS sin instalar es
   * el gesto "atrás" del sistema. 0 = sin franja.
   */
  edgeGuard?: number;
}

export interface GoToOptions {
  /** Guarda la posición actual para la píldora "↺ pág. N". */
  recordJump?: boolean;
}

export interface ChapterDescription {
  chapterIndex: number;
  chapterId: string;
  title: string;
  label: string;
  /** Página dentro del capítulo (si se conoce). */
  pageInChapter: number | null;
}

export interface ReaderEngine {
  readonly ready: Promise<void>;
  on<K extends ReaderEventName>(event: K, listener: (payload: ReaderEvents[K]) => void): () => void;
  goTo(location: Location, options?: GoToOptions): Promise<void>;
  goToChapter(chapterId: string, options?: GoToOptions): Promise<void>;
  goToBlock(chapterId: string, blockId: string, options?: GoToOptions): Promise<void>;
  goToPercent(percent: number, options?: GoToOptions): Promise<void>;
  goToGlobalPage(page: number, options?: GoToOptions): Promise<void>;
  next(): void;
  prev(): void;
  setPrefs(prefs: ReaderPreferences): Promise<void>;
  position(): ReaderPosition | null;
  pages(): PagesInfo | null;
  describeGlobalPage(page: number): ChapterDescription | null;
  describePercent(percent: number): ChapterDescription | null;
  /** ¿La ubicación cae en la página visible? (marcadores). */
  pageContains(location: Location): boolean;
  /** Contenedor con el texto visible: capa actual o vista de desplazamiento (selección). */
  currentContainer(): HTMLElement | null;
  /** Vuelve a aplicar el decorador a todas las copias montadas. */
  redecorate(): void;
  destroy(): void;
}

interface Cursor {
  chapterIndex: number;
  page: number;
}

type TurnStyle = 'curl' | 'slide';
type Direction = 'forward' | 'backward';

interface TurnState {
  direction: Direction;
  style: TurnStyle;
  turning: PageLayer;
  under: PageLayer;
  corner: Corner;
  /** Curl: P al empezar el arrastre (o al atrapar la animación). Deslizar: {x: offset}. */
  base: Point;
  /**
   * Curl: dónde agarró el dedo la hoja; el pliegue lo sigue (`followPoint`). Null tras atrapar una
   * animación: entonces P se mueve desde `base` con `dragPoint`.
   */
  grab: Point | null;
  point: Point;
  animation: SpringAnimation | TimedAnimation | null;
  /** Resultado al que va la animación en curso. */
  heading: 'complete' | 'cancel' | null;
}

/** Súbelo cuando cambie CSS que afecte la paginación: invalida los conteos guardados. */
const LAYOUT_VERSION = 'l3';
const CURL_TAP_MS = 560;
const SLIDE_TAP_MS = 300;
const CURL_OMEGA = 14;
const SLIDE_OMEGA = 20;

export function createReaderEngine(options: ReaderEngineOptions): ReaderEngine {
  return new Engine(options);
}

class Engine implements ReaderEngine {
  readonly ready: Promise<void>;
  private readonly emitter = new Emitter();
  private readonly store: ChapterStore;
  private readonly manifest: BookManifest;
  private readonly root: HTMLElement;
  private readonly surface: HTMLElement;
  private prefs: ReaderPreferences;
  private mode: 'paged' | 'scroll';
  private turnStyle: TurnStyle;

  private width = 0;
  private height = 0;
  private key = '';
  private readonly layouts = new Map<string, ChapterLayout>();

  private stack: HTMLDivElement | null = null;
  private layers: { prev: PageLayer; current: PageLayer; next: PageLayer } | null = null;
  private flap: FlapLayer | null = null;
  private measurer: Measurer | null = null;
  private curl: CurlRenderer | null = null;
  private readonly slide = new SlideRenderer();
  private gestures: GestureController | null = null;
  private scrollView: ScrollView | null = null;

  private cursor: Cursor = { chapterIndex: 0, page: 0 };
  private nextCursor: Cursor | null = null;
  private prevCursor: Cursor | null = null;
  private syncToken = 0;
  private pendingSync: Promise<void> | null = null;
  private turn: TurnState | null = null;
  private turnWaiters: (() => void)[] = [];

  private pagesInfo: PagesInfo | null = null;
  private counts: Record<string, number> = {};
  private counter: PageCounter | null = null;
  private lastPosition: ReaderPosition | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private colorQuery: MediaQueryList | null = null;
  private destroyed = false;

  constructor(private readonly options: ReaderEngineOptions) {
    this.root = options.root;
    this.surface = options.surface;
    this.manifest = options.manifest;
    this.prefs = options.prefs;
    this.store = new ChapterStore(options.manifest, options.fetchChapter);
    this.mode = options.prefs.pageTurn === 'scroll' ? 'scroll' : 'paged';
    this.turnStyle = this.effectiveTurnStyle(options.prefs);
    this.ready = this.start();
  }

  /* ----------------------------------------------------------- ciclo de vida ------------- */

  private async start(): Promise<void> {
    applyPreferences(this.root, this.prefs);
    this.surface.classList.add('rd-surface');
    this.surface.addEventListener('click', this.onClick);
    this.surface.addEventListener('change', this.onChange);
    window.addEventListener('keydown', this.onKey);
    this.colorQuery =
      typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    this.colorQuery?.addEventListener('change', this.onColorScheme);
    this.buildView();
    await waitForFonts(this.prefs);
    if (this.destroyed) return;
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.surface);
    const initial = this.validLocation(this.options.initialLocation);
    try {
      if (initial) await this.goTo(initial);
      else await this.showCursor({ chapterIndex: 0, page: 0 });
    } catch (error) {
      this.emitter.emit('error', { message: (error as Error).message });
      return;
    }
    this.root.dataset.ready = 'true';
    this.emitter.emit('ready', undefined);
    this.startCounter();
  }

  destroy(): void {
    this.destroyed = true;
    this.counter?.cancel();
    this.finishTurnNow();
    this.teardownView();
    this.surface.removeEventListener('click', this.onClick);
    this.surface.removeEventListener('change', this.onChange);
    window.removeEventListener('keydown', this.onKey);
    this.colorQuery?.removeEventListener('change', this.onColorScheme);
    this.resizeObserver?.disconnect();
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.emitter.clear();
  }

  on<K extends ReaderEventName>(
    event: K,
    listener: (payload: ReaderEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  position(): ReaderPosition | null {
    return this.lastPosition;
  }

  pages(): PagesInfo | null {
    return this.pagesInfo;
  }

  pageContains(location: Location): boolean {
    if (this.scrollView) return this.lastPosition?.location.blockId === location.blockId;
    const chapter = this.manifest.chapters[this.cursor.chapterIndex];
    if (!chapter || chapter.id !== location.chapterId) return false;
    const layout = this.layouts.get(chapter.id);
    if (!layout?.byId.has(location.blockId)) return false;
    return locationToPage(layout, location.blockId, location.charOffset) === this.cursor.page;
  }

  currentContainer(): HTMLElement | null {
    if (this.scrollView) return this.scrollView.container();
    return this.layers?.current.flow ?? null;
  }

  redecorate(): void {
    if (this.scrollView) {
      this.scrollView.redecorate();
      return;
    }
    if (!this.layers) return;
    for (const layer of [this.layers.prev, this.layers.current, this.layers.next])
      layer.redecorate();
    this.flap?.page.redecorate();
  }

  private effectiveTurnStyle(prefs: ReaderPreferences): TurnStyle {
    if (prefs.pageTurn === 'slide' || prefersReducedMotion()) return 'slide';
    return 'curl';
  }

  private validLocation(location: Location | null): Location | null {
    if (!location) return null;
    return this.manifest.chapters.some((c) => c.id === location.chapterId) ? location : null;
  }

  /* ----------------------------------------------------------- vistas ------------------- */

  private buildView(): void {
    this.surface.dataset.view = this.mode;
    if (this.mode === 'scroll') {
      this.scrollView = new ScrollView(this.surface, this.manifest, this.store, {
        onPosition: (index, anchor, words, atEnd) =>
          this.onScrollPosition(index, anchor, words, atEnd),
        onTapCenter: () => this.emitter.emit('tapCenter', undefined),
        decorate: this.options.decorate,
      });
      return;
    }
    const stack = document.createElement('div');
    stack.className = 'rd-stack';
    const prev = new PageLayer('prev');
    const current = new PageLayer('current');
    const next = new PageLayer('next');
    const cast = document.createElement('div');
    cast.className = 'rd-cast';
    const flap = new FlapLayer();
    stack.append(prev.el, current.el, next.el, cast, flap.el);
    this.surface.appendChild(stack);
    this.measurer = new Measurer(this.surface);
    this.stack = stack;
    this.layers = { prev, current, next };
    this.flap = flap;
    const decorate = this.options.decorate ?? null;
    for (const layer of [prev, current, next, flap.page]) layer.decorator = decorate;
    this.curl = new CurlRenderer({ flap, cast });
    this.assignRoles();
    this.gestures = new GestureController(
      stack,
      {
        canTurn: (direction) => this.canTurn(direction),
        isAnimating: () => Boolean(this.turn?.animation),
        catchAnimation: () => this.catchAnimation(),
        dragStart: (direction, start) => this.dragStart(direction, start),
        dragMove: (point, delta) => this.dragMove(point, delta),
        dragEnd: (velocity, delta) => this.dragEnd(velocity, delta),
        tap: (action) => {
          if (action === 'next') this.next();
          else if (action === 'prev') this.prev();
          else this.emitter.emit('tapCenter', undefined);
        },
      },
      this.options.edgeGuard ?? 0,
    );
    this.updateGeometry();
  }

  private teardownView(): void {
    this.gestures?.destroy();
    this.gestures = null;
    this.stack?.remove();
    this.measurer?.elements.el.remove();
    this.scrollView?.destroy();
    this.stack = null;
    this.layers = null;
    this.flap = null;
    this.curl = null;
    this.measurer = null;
    this.scrollView = null;
    this.layouts.clear();
  }

  private assignRoles(): void {
    if (!this.layers) return;
    this.layers.current.setRole('current');
    this.layers.next.setRole('next');
    this.layers.prev.setRole('prev');
  }

  /** Lee el tamaño de la superficie y fija las variables de columna. Devuelve la clave de layout. */
  private updateGeometry(): string {
    const rect = this.surface.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const mx = MARGIN_PX[this.prefs.margins];
    const colWidth = Math.max(120, this.width - 2 * mx);
    this.root.style.setProperty('--page-w', `${this.width}px`);
    this.root.style.setProperty('--col-w', `${colWidth}px`);
    this.root.style.setProperty('--col-gap', `${2 * mx}px`);
    const frame = this.measurer?.frameSize();
    const colHeight = Math.max(160, Math.floor(frame?.height ?? this.height - 120));
    this.root.style.setProperty('--col-h', `${colHeight}px`);
    const key = layoutKey({ ...this.prefs, width: this.width, height: colHeight });
    if (key !== this.key) {
      this.key = key;
      this.layouts.clear();
    }
    return key;
  }

  /* ----------------------------------------------------------- layout ------------------- */

  private async layoutFor(chapterIndex: number): Promise<ChapterLayout> {
    const chapter = this.manifest.chapters[chapterIndex];
    if (!chapter) throw new Error(`Capítulo fuera de rango: ${chapterIndex}`);
    const key = this.key;
    const cached = this.layouts.get(chapter.id);
    if (cached) return cached;
    const html = await this.store.get(chapter.id);
    if (!this.measurer) throw new Error('Medidor no disponible');
    if (key !== this.key) return this.layoutFor(chapterIndex);
    const flow = this.measurer.load(chapter.id, html);
    const layout = buildChapterLayout(chapter.id, measureFlow(flow), chapter.words, this.width);
    this.layouts.set(chapter.id, layout);
    this.noteCount(chapter.id, layout.pages);
    return layout;
  }

  /** Si un capítulo medido no coincide con el conteo guardado, se corrigen las páginas globales. */
  private noteCount(chapterId: string, pages: number): void {
    this.counter?.known(chapterId, pages);
    if (!this.pagesInfo || this.counts[chapterId] === pages) return;
    this.counts[chapterId] = pages;
    this.publishPages();
  }

  /** Olvida las páginas globales (y avisa a la UI) antes de recalcularlas. */
  private resetPages(): void {
    this.counter?.cancel();
    this.counter = null;
    this.counts = {};
    if (this.pagesInfo) {
      this.pagesInfo = null;
      this.emitter.emit('pages', null);
    }
  }

  private startCounter(): void {
    if (this.mode !== 'paged') return;
    this.resetPages();
    const ids = this.manifest.chapters.map((c) => c.id);
    const counter = new PageCounter({
      chapterIds: ids,
      key: `${LAYOUT_VERSION}:${this.options.slug}:${this.manifest.sourceHash}:${this.key}`,
      cache: this.options.pageCountCache,
      measure: async (index) => {
        await this.whenNoTurn();
        return (await this.layoutFor(index)).pages;
      },
      onDone: (counts) => {
        if (this.destroyed || counter !== this.counter) return;
        this.counts = { ...counts };
        for (const [id, layout] of this.layouts) this.counts[id] = layout.pages;
        this.publishPages();
      },
    });
    for (const [id, layout] of this.layouts) counter.known(id, layout.pages);
    this.counter = counter;
    counter.start().catch(() => {});
  }

  private publishPages(): void {
    const list = this.manifest.chapters.map((c) => this.counts[c.id] ?? 1);
    this.pagesInfo = chapterStarts(list);
    this.emitter.emit('pages', this.pagesInfo);
    this.emitPosition();
  }

  private whenNoTurn(): Promise<void> {
    if (!this.turn) return Promise.resolve();
    return new Promise((resolve) => this.turnWaiters.push(resolve));
  }

  /* ----------------------------------------------------------- navegación --------------- */

  async goTo(location: Location, options: GoToOptions = {}): Promise<void> {
    const chapterIndex = this.manifest.chapters.findIndex((c) => c.id === location.chapterId);
    if (chapterIndex === -1) return;
    if (options.recordJump) this.recordJump();
    if (this.scrollView) {
      await this.scrollView.goTo(chapterIndex, location.blockId || null, location.charOffset);
      return;
    }
    this.finishTurnNow();
    const layout = await this.layoutFor(chapterIndex);
    const page = locationToPage(layout, location.blockId, location.charOffset);
    await this.showCursor({ chapterIndex, page });
  }

  goToChapter(chapterId: string, options: GoToOptions = {}): Promise<void> {
    const chapter = this.manifest.chapters.find((c) => c.id === chapterId);
    if (!chapter) return Promise.resolve();
    return this.goTo({ chapterId, blockId: `${chapterId}.head`, charOffset: 0 }, options);
  }

  goToBlock(chapterId: string, blockId: string, options: GoToOptions = {}): Promise<void> {
    return this.goTo({ chapterId, blockId, charOffset: 0 }, options);
  }

  async goToPercent(percent: number, options: GoToOptions = {}): Promise<void> {
    const target = clamp(percent, 0, 1) * this.manifest.totalWords;
    const description = this.describePercent(percent);
    if (!description) return;
    const chapter = this.manifest.chapters[description.chapterIndex];
    if (!chapter) return;
    if (this.scrollView) {
      // En desplazamiento basta con llegar a la sección más cercana.
      const section = [...chapter.sections]
        .reverse()
        .find((s) => chapter.wordStart + s.wordStart <= target);
      await this.goTo(
        { chapterId: chapter.id, blockId: section?.blockId ?? `${chapter.id}.head`, charOffset: 0 },
        options,
      );
      return;
    }
    if (options.recordJump) this.recordJump();
    const layout = await this.layoutFor(description.chapterIndex);
    const relative = target - chapter.wordStart;
    const block =
      [...layout.blocks].reverse().find((b) => b.wordStart <= relative) ?? layout.blocks[0];
    if (!block) return;
    const fraction = block.words > 0 ? clamp((relative - block.wordStart) / block.words, 0, 1) : 0;
    const page = locationToPage(layout, block.id, Math.round(fraction * block.chars));
    await this.showCursor({ chapterIndex: description.chapterIndex, page });
  }

  async goToGlobalPage(page: number, options: GoToOptions = {}): Promise<void> {
    if (!this.pagesInfo) return;
    const { chapterIndex, page: inChapter } = locateGlobalPage(this.pagesInfo, page);
    if (options.recordJump) this.recordJump();
    const layout = await this.layoutFor(chapterIndex);
    await this.showCursor({ chapterIndex, page: Math.min(layout.pages - 1, inChapter) });
  }

  describeGlobalPage(page: number): ChapterDescription | null {
    if (!this.pagesInfo) return null;
    const { chapterIndex, page: inChapter } = locateGlobalPage(this.pagesInfo, page);
    const chapter = this.manifest.chapters[chapterIndex];
    if (!chapter) return null;
    return {
      chapterIndex,
      chapterId: chapter.id,
      title: chapter.title,
      label: chapter.label,
      pageInChapter: inChapter,
    };
  }

  describePercent(percent: number): ChapterDescription | null {
    const target = clamp(percent, 0, 1) * this.manifest.totalWords;
    const chapters = this.manifest.chapters;
    let index = 0;
    for (let i = 0; i < chapters.length; i++) {
      if ((chapters[i]?.wordStart ?? 0) <= target) index = i;
    }
    const chapter = chapters[index];
    if (!chapter) return null;
    return {
      chapterIndex: index,
      chapterId: chapter.id,
      title: chapter.title,
      label: chapter.label,
      pageInChapter: null,
    };
  }

  next(): void {
    if (this.scrollView) {
      this.scrollView.next();
      return;
    }
    this.autoTurn('forward');
  }

  prev(): void {
    if (this.scrollView) {
      this.scrollView.prev();
      return;
    }
    this.autoTurn('backward');
  }

  private recordJump(): void {
    if (this.lastPosition) this.emitter.emit('jump', { from: this.lastPosition });
  }

  /** Muestra un cursor en la capa actual y prepara las vecinas. */
  private async showCursor(cursor: Cursor): Promise<void> {
    if (!this.layers) return;
    const token = ++this.syncToken;
    const chapter = this.manifest.chapters[cursor.chapterIndex];
    if (!chapter) return;
    const layout = await this.layoutFor(cursor.chapterIndex);
    const html = await this.store.get(chapter.id);
    const layers = this.layers;
    if (token !== this.syncToken || !layers) return;
    this.cursor = {
      chapterIndex: cursor.chapterIndex,
      page: clamp(cursor.page, 0, layout.pages - 1),
    };
    layers.current.show(chapter.id, html, this.cursor.page, this.width);
    this.emitPosition();
    await this.syncNeighbors(token);
  }

  /** Calcula y dibuja las páginas anterior y siguiente del cursor actual. */
  private syncNeighbors(token = ++this.syncToken): Promise<void> {
    const pending = this.computeNeighbors(token);
    this.pendingSync = pending.catch(() => {});
    return pending;
  }

  private async computeNeighbors(token: number): Promise<void> {
    const layers = this.layers;
    if (!layers) return;
    this.nextCursor = null;
    this.prevCursor = null;
    const [next, prev] = await Promise.all([
      this.neighbor(this.cursor, 'forward'),
      this.neighbor(this.cursor, 'backward'),
    ]);
    if (token !== this.syncToken || !this.layers) return;
    await Promise.all([
      this.renderLayer(layers.next, next, 'end'),
      this.renderLayer(layers.prev, prev, 'start'),
    ]);
    if (token !== this.syncToken) return;
    this.nextCursor = next;
    this.prevCursor = prev;
    const ids = [next, prev]
      .filter(Boolean)
      .map((c) => this.manifest.chapters[(c as Cursor).chapterIndex]?.id ?? '');
    const following = this.manifest.chapters[this.cursor.chapterIndex + 1]?.id;
    this.store.prefetch([...ids, ...(following ? [following] : [])]);
  }

  private async neighbor(cursor: Cursor, direction: Direction): Promise<Cursor | null> {
    const count = this.manifest.chapters.length;
    if (direction === 'forward') {
      const layout = await this.layoutFor(cursor.chapterIndex);
      if (cursor.page + 1 < layout.pages)
        return { chapterIndex: cursor.chapterIndex, page: cursor.page + 1 };
      if (cursor.chapterIndex + 1 < count)
        return { chapterIndex: cursor.chapterIndex + 1, page: 0 };
      return null;
    }
    if (cursor.page > 0) return { chapterIndex: cursor.chapterIndex, page: cursor.page - 1 };
    if (cursor.chapterIndex > 0) {
      const layout = await this.layoutFor(cursor.chapterIndex - 1);
      return { chapterIndex: cursor.chapterIndex - 1, page: layout.pages - 1 };
    }
    return null;
  }

  private async renderLayer(
    layer: PageLayer,
    cursor: Cursor | null,
    blank: 'start' | 'end',
  ): Promise<void> {
    if (!cursor) {
      layer.showBlank(blank, blank === 'end' ? 'Fin' : '');
      return;
    }
    const chapter = this.manifest.chapters[cursor.chapterIndex];
    if (!chapter) return;
    const html = this.store.peek(chapter.id) ?? (await this.store.get(chapter.id));
    layer.show(chapter.id, html, cursor.page, this.width);
  }

  /* ----------------------------------------------------------- posición ----------------- */

  private emitPosition(): void {
    if (this.scrollView) {
      if (this.lastPosition) this.emitter.emit('location', this.lastPosition);
      return;
    }
    const chapter = this.manifest.chapters[this.cursor.chapterIndex];
    const layout = chapter ? this.layouts.get(chapter.id) : undefined;
    if (!chapter || !layout) return;
    const anchor = pageAnchor(layout, this.cursor.page);
    const words = chapter.wordStart + wordsBefore(layout, anchor);
    const last = this.manifest.chapters.length - 1;
    const atEnd = this.cursor.chapterIndex === last && this.cursor.page >= layout.pages - 1;
    const position: ReaderPosition = {
      mode: 'paged',
      location: { chapterId: chapter.id, blockId: anchor.blockId, charOffset: anchor.charOffset },
      percent: atEnd ? 1 : percentFromWordOffset(words, this.manifest.totalWords),
      chapterIndex: this.cursor.chapterIndex,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterLabel: chapter.label,
      pageInChapter: this.cursor.page,
      pagesInChapter: layout.pages,
      globalPage: this.pagesInfo
        ? (this.pagesInfo.chapterStarts[this.cursor.chapterIndex] ?? 0) + this.cursor.page
        : null,
      totalPages: this.pagesInfo?.total ?? null,
      atStart: this.cursor.chapterIndex === 0 && this.cursor.page === 0,
      atEnd,
    };
    this.publishPosition(position);
  }

  private onScrollPosition(
    index: number,
    anchor: PageAnchor,
    wordsInChapter: number,
    atEnd: boolean,
  ): void {
    const chapter = this.manifest.chapters[index];
    if (!chapter) return;
    const words = chapter.wordStart + wordsInChapter;
    this.publishPosition({
      mode: 'scroll',
      location: {
        chapterId: chapter.id,
        blockId: anchor.blockId || `${chapter.id}.head`,
        charOffset: anchor.charOffset,
      },
      percent: atEnd ? 1 : percentFromWordOffset(words, this.manifest.totalWords),
      chapterIndex: index,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterLabel: chapter.label,
      pageInChapter: null,
      pagesInChapter: null,
      globalPage: null,
      totalPages: null,
      atStart: index === 0 && wordsInChapter <= 0,
      atEnd,
    });
  }

  private publishPosition(position: ReaderPosition): void {
    this.lastPosition = position;
    const ds = this.root.dataset;
    ds.chapter = position.chapterId;
    ds.block = position.location.blockId;
    ds.page = position.pageInChapter === null ? '' : String(position.pageInChapter);
    ds.globalPage = position.globalPage === null ? '' : String(position.globalPage);
    this.emitter.emit('location', position);
  }

  /* ----------------------------------------------------------- giros -------------------- */

  private canTurn(direction: Direction): boolean {
    if (!this.layers) return false;
    if (direction === 'forward') return this.nextCursor !== null && !this.layers.next.blank;
    return this.prevCursor !== null && !this.layers.prev.blank;
  }

  private size() {
    return { width: this.width, height: this.height };
  }

  private beginTurn(direction: Direction, corner: Corner): TurnState | null {
    const layers = this.layers;
    if (!layers || !this.canTurn(direction)) return null;
    const style = this.turnStyle;
    const turning = direction === 'forward' ? layers.current : layers.prev;
    const under = direction === 'forward' ? layers.next : layers.current;
    const size = this.size();
    let base: Point;
    if (style === 'curl') {
      const flap = this.flap;
      const html = turning.chapterId ? this.store.peek(turning.chapterId) : undefined;
      if (flap && turning.chapterId && html)
        flap.page.show(turning.chapterId, html, turning.page, this.width);
      this.curl?.begin(turning, under);
      base = direction === 'forward' ? cornerPoint(size, corner) : turnedPoint(size, corner);
    } else {
      this.slide.begin(
        direction,
        layers.current,
        direction === 'forward' ? layers.next : layers.prev,
      );
      base = { x: 0, y: 0 };
    }
    const turn: TurnState = {
      direction,
      style,
      turning,
      under,
      corner,
      base,
      grab: null,
      point: { ...base },
      animation: null,
      heading: null,
    };
    this.turn = turn;
    this.renderTurn(turn);
    return turn;
  }

  private renderTurn(turn: TurnState): void {
    if (turn.style === 'curl') {
      this.curl?.render(computeFold(this.size(), turn.corner, turn.point), this.size());
    } else {
      this.slide.render(turn.direction, turn.point.x, this.width);
    }
  }

  private dragStart(direction: Direction, start: Point): void {
    this.finishTurnNow();
    const turn = this.beginTurn(direction, anchorCorner(start.y, this.height));
    if (turn) turn.grab = { ...start };
  }

  private dragMove(point: Point, delta: Point): void {
    const turn = this.turn;
    if (!turn || turn.animation) return;
    if (turn.style === 'curl') {
      turn.point = turn.grab
        ? followPoint(this.size(), turn.corner, turn.direction, turn.grab, point)
        : dragPoint(this.size(), turn.corner, turn.direction, turn.base, delta);
    } else {
      const raw = turn.base.x + delta.x;
      const x =
        turn.direction === 'forward' ? clamp(raw, -this.width, 0) : clamp(raw, 0, this.width);
      turn.point = { x, y: 0 };
    }
    this.renderTurn(turn);
  }

  private dragEnd(velocity: Point, delta: Point): void {
    const turn = this.turn;
    if (!turn) return;
    const w = this.width;
    const along = turn.direction === 'forward' ? -velocity.x : velocity.x;
    let travel: number;
    let turned = 0;
    if (turn.style === 'curl' && turn.grab) {
      // Lo que cuenta es el dedo, no P: al agarrar en medio el pliegue se adelanta al alcanzarlo.
      travel = turn.direction === 'forward' ? -delta.x : delta.x;
      const progress = turnProgress(this.size(), turn.point.x);
      turned = turn.direction === 'forward' ? progress : 1 - progress;
    } else if (turn.style === 'curl') {
      travel = turn.direction === 'forward' ? w - turn.point.x : (turn.point.x + w) / 2;
    } else {
      travel = Math.abs(turn.point.x);
    }
    const complete = shouldCompleteTurn(travel, along, w, turned);
    this.settle(turn, complete, { x: velocity.x * 1000, y: velocity.y * 1000 });
  }

  /** Lleva el giro a su final (completar o cancelar) con un resorte. */
  private settle(turn: TurnState, complete: boolean, velocity: Point): void {
    const size = this.size();
    let target: Point;
    if (turn.style === 'curl') {
      const flat = cornerPoint(size, turn.corner);
      const gone = turnedPoint(size, turn.corner);
      target = turn.direction === 'forward' ? (complete ? gone : flat) : complete ? flat : gone;
    } else {
      const out = turn.direction === 'forward' ? -size.width : size.width;
      target = { x: complete ? out : 0, y: 0 };
    }
    // Velocidad de P por px/s del dedo: con el pliegue bajo el dedo (o hacia atrás), P va al doble.
    const factor = turn.style === 'curl' && (turn.grab || turn.direction === 'backward') ? 2 : 1;
    turn.heading = complete ? 'complete' : 'cancel';
    const animation = animateSpring2D(
      turn.point,
      { x: velocity.x * factor, y: turn.style === 'curl' ? velocity.y * 0.5 : 0 },
      target,
      (p) => {
        turn.point = p;
        this.renderTurn(turn);
      },
      { omega: turn.style === 'curl' ? CURL_OMEGA : SLIDE_OMEGA, restDistance: 0.75 },
    );
    turn.animation = animation;
    animation.done.then((arrived) => {
      if (arrived && this.turn === turn) this.endTurn(turn, complete);
    });
  }

  /** Toque en una zona lateral (o tecla): giro animado completo. */
  private autoTurn(direction: Direction, retried = false): void {
    this.finishTurnNow();
    if (!this.canTurn(direction) && !retried && this.pendingSync) {
      // Toques rápidos: la vecina se está preparando; se reintenta en cuanto esté lista.
      this.pendingSync.then(() => this.autoTurn(direction, true));
      return;
    }
    const turn = this.beginTurn(direction, 'bottom');
    if (!turn) return;
    turn.heading = 'complete';
    const size = this.size();
    const duration = turn.style === 'curl' ? CURL_TAP_MS : SLIDE_TAP_MS;
    const animation = animateTimed(duration, (t) => {
      if (turn.style === 'curl') {
        turn.point = autoTurnPoint(size, turn.corner, direction === 'forward' ? t : 1 - t);
      } else {
        turn.point = { x: (direction === 'forward' ? -1 : 1) * size.width * t, y: 0 };
      }
      this.renderTurn(turn);
    });
    turn.animation = animation;
    animation.done.then((arrived) => {
      if (arrived && this.turn === turn) this.endTurn(turn, true);
    });
  }

  /** Un dedo toca la página mientras se anima: se detiene y el arrastre continúa desde ahí. */
  private catchAnimation(): boolean {
    const turn = this.turn;
    if (!turn?.animation) return false;
    turn.animation.cancel();
    turn.animation = null;
    turn.heading = null;
    turn.base = { ...turn.point };
    turn.grab = null;
    return true;
  }

  /** Termina de inmediato cualquier giro en curso (sin animación). */
  private finishTurnNow(): void {
    const turn = this.turn;
    if (!turn) return;
    turn.animation?.cancel();
    this.endTurn(turn, turn.heading === 'complete');
  }

  private endTurn(turn: TurnState, complete: boolean): void {
    if (this.turn !== turn) return;
    this.turn = null;
    if (turn.style === 'curl') this.curl?.end();
    else this.slide.end();
    if (complete) this.commit(turn.direction);
    const waiters = this.turnWaiters;
    this.turnWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Rota las capas tras completar un giro y prepara la nueva vecina. */
  private commit(direction: Direction): void {
    const layers = this.layers;
    if (!layers) return;
    const target = direction === 'forward' ? this.nextCursor : this.prevCursor;
    if (!target) return;
    const { prev, current, next } = layers;
    this.layers =
      direction === 'forward'
        ? { prev: current, current: next, next: prev }
        : { prev: next, current: prev, next: current };
    this.assignRoles();
    this.cursor = target;
    const token = ++this.syncToken;
    this.emitter.emit('turn', { direction });
    this.emitPosition();
    this.syncNeighbors(token).catch(() => {});
  }

  /* ----------------------------------------------------------- preferencias -------------- */

  async setPrefs(prefs: ReaderPreferences): Promise<void> {
    const before = this.prefs;
    this.prefs = prefs;
    applyPreferences(this.root, prefs);
    const nextMode = prefs.pageTurn === 'scroll' ? 'scroll' : 'paged';
    this.turnStyle = this.effectiveTurnStyle(prefs);
    const location = this.lastPosition?.location ?? null;
    if (nextMode !== this.mode) {
      this.finishTurnNow();
      this.resetPages();
      this.teardownView();
      this.mode = nextMode;
      this.buildView();
      await waitForFonts(prefs);
      if (location) await this.goTo(location);
      else if (this.mode === 'paged') await this.showCursor({ chapterIndex: 0, page: 0 });
      else await this.scrollView?.goTo(0, null, 0);
      this.startCounter();
      return;
    }
    if (this.mode === 'scroll') return;
    if (!affectsLayout(before, prefs)) return;
    await waitForFonts(prefs);
    await this.relayout(location);
  }

  private async relayout(location: Location | null): Promise<void> {
    if (this.mode !== 'paged' || this.destroyed) return;
    this.finishTurnNow();
    const previousKey = this.key;
    this.updateGeometry();
    if (this.key === previousKey) return;
    this.resetPages();
    // Las capas conservan su HTML; solo cambian las medidas: se reubican desde la ubicación.
    if (location) await this.goTo(location);
    this.startCounter();
  }

  private onResize = () => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const rect = this.surface.getBoundingClientRect();
      if (Math.abs(rect.width - this.width) < 1 && Math.abs(rect.height - this.height) < 1) return;
      this.relayout(this.lastPosition?.location ?? null).catch(() => {});
    }, 140);
  };

  private onColorScheme = () => {
    if (this.prefs.appearance === 'auto') applyPreferences(this.root, this.prefs);
  };

  /* ----------------------------------------------------------- clics y teclas ------------ */

  private onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || event.defaultPrevented) return;
    const xref = target.closest('a.xref') as HTMLAnchorElement | null;
    if (xref) {
      event.preventDefault();
      const chapter = xref.dataset.chapter;
      const block = xref.dataset.block;
      if (chapter && block) this.goToBlock(chapter, block, { recordJump: true }).catch(() => {});
      return;
    }
    const term = target.closest('.term') as HTMLElement | null;
    if (term?.dataset.term) {
      this.emitter.emit('term', { termId: term.dataset.term, rect: rectOf(term) });
      return;
    }
    const mark = target.closest('mark.hl') as HTMLElement | null;
    if (mark?.dataset.hl) {
      this.emitter.emit('highlight', { highlightId: mark.dataset.hl, rect: rectOf(mark) });
      return;
    }
    const question = target.closest('.qa') as HTMLElement | null;
    if (question?.dataset.q && !target.closest('a[href], .ref, input, label, button')) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
      this.emitter.emit('question', { questionId: question.dataset.q });
      return;
    }
    if (
      target.closest('a[href], input, label') ||
      (target.closest('button') && !target.closest('.rd-expand'))
    )
      return;
    const viewer = viewerRequestFor(target);
    if (viewer) this.emitter.emit('openViewer', viewer);
  };

  private onChange = (event: Event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const itemId = input?.dataset.check;
    if (!input || !itemId) return;
    this.emitter.emit('check', { itemId, checked: input.checked });
  };

  private onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.closest('[role="dialog"]')) return;
    if (
      event.key === 'ArrowRight' ||
      event.key === 'PageDown' ||
      (event.key === ' ' && !event.shiftKey)
    ) {
      event.preventDefault();
      this.next();
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'PageUp' ||
      (event.key === ' ' && event.shiftKey)
    ) {
      event.preventDefault();
      this.prev();
    }
  };
}

function rectOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function affectsLayout(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return (
    a.fontFamily !== b.fontFamily ||
    a.fontScale !== b.fontScale ||
    a.lineHeight !== b.lineHeight ||
    a.margins !== b.margins ||
    a.justify !== b.justify ||
    a.bold !== b.bold ||
    a.codeWrap !== b.codeWrap ||
    a.codeScale !== b.codeScale ||
    // Los temas "Negrita" (peso del texto) y "Dev" (fuente pixel) repaginan.
    themeLayout(a.theme) !== themeLayout(b.theme)
  );
}

function viewerRequestFor(target: Element): ViewerRequest | null {
  const expand = target.closest('.rd-expand');
  const code = expand?.closest('.b-code') as HTMLElement | null;
  if (code) {
    return {
      kind: 'code',
      html: cleanHtml(code),
      text: code.querySelector('pre')?.textContent ?? '',
      label: code.dataset.lang ?? null,
    };
  }
  const table = expand?.closest('.b-table') as HTMLElement | null;
  if (table)
    return { kind: 'table', html: cleanHtml(table), text: table.textContent ?? '', label: null };
  const diagram = target.closest('.b-diagram') as HTMLElement | null;
  if (diagram) return { kind: 'diagram', html: diagram.outerHTML, text: '', label: null };
  return null;
}

/** Copia del bloque sin los botones que añade el lector. */
function cleanHtml(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const button of clone.querySelectorAll('.rd-expand')) button.remove();
  return clone.outerHTML;
}
