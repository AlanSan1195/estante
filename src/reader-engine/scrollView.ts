/**
 * Modo Desplazamiento continuo: los capítulos se encadenan en vertical y se lee con el scroll
 * nativo. Se dibujan solo los capítulos cercanos: al acercarse al final se añade el siguiente y al
 * acercarse al principio se antepone el anterior (Safari no tiene scroll anchoring, así que se
 * compensa `scrollTop` a mano). La ubicación es el bloque que cruza la parte superior visible.
 */

import type { BookManifest } from '../core/domain/published';
import type { ChapterStore } from './chapterStore';
import { INTERACTIVE_SELECTOR, TAP_MAX_DURATION, TAP_MAX_MOVEMENT } from './gestures';
import { decorateBlocks, scopeSvgIds } from './layers';
import type { PageAnchor } from './paginator';
import type { ChapterDecorator } from './types';

export interface ScrollViewCallbacks {
  /** `wordsInChapter`: palabras del capítulo antes de la posición (para el porcentaje). */
  onPosition(
    chapterIndex: number,
    anchor: PageAnchor,
    wordsInChapter: number,
    atEnd: boolean,
  ): void;
  onTapCenter(): void;
  decorate?: ChapterDecorator;
}

export class ScrollView {
  readonly el: HTMLDivElement;
  private readonly inner: HTMLDivElement;
  private readonly sections = new Map<number, HTMLElement>();
  private from = 0;
  private to = -1;
  private frame = 0;
  private loading = false;
  private destroyed = false;
  private down: { x: number; y: number; t: number; delegated: boolean } | null = null;

  constructor(
    surface: HTMLElement,
    private readonly manifest: BookManifest,
    private readonly store: ChapterStore,
    private readonly callbacks: ScrollViewCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'rd-scroll';
    this.inner = document.createElement('div');
    this.inner.className = 'rd-scroll-inner';
    this.el.appendChild(this.inner);
    surface.appendChild(this.el);
    this.el.addEventListener('scroll', this.onScroll, { passive: true });
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointerup', this.onUp);
  }

  async goTo(chapterIndex: number, blockId: string | null, charOffset: number): Promise<void> {
    if (chapterIndex < this.from || chapterIndex > this.to) {
      this.inner.replaceChildren();
      this.sections.clear();
      this.from = chapterIndex;
      this.to = chapterIndex - 1;
      await this.append();
    }
    const section = this.sections.get(chapterIndex);
    if (!section) return;
    const target = blockId
      ? (section.querySelector(`[data-b="${CSS.escape(blockId)}"]`) as HTMLElement | null)
      : null;
    const element = target ?? section;
    const containerTop = this.el.getBoundingClientRect().top;
    const rect = element.getBoundingClientRect();
    const chars = (element.textContent ?? '').length;
    const fraction = chars > 0 ? Math.min(1, charOffset / chars) : 0;
    this.el.scrollTop += rect.top - containerTop - this.topInset() + fraction * rect.height;
    await this.fill();
    this.report();
  }

  next(): void {
    this.el.scrollBy({ top: this.el.clientHeight * 0.85, behavior: 'smooth' });
  }

  prev(): void {
    this.el.scrollBy({ top: -this.el.clientHeight * 0.85, behavior: 'smooth' });
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.el.removeEventListener('scroll', this.onScroll);
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.remove();
  }

  private topInset(): number {
    return Number.parseFloat(getComputedStyle(this.el).scrollPaddingTop) || 64;
  }

  private async append(): Promise<void> {
    const index = this.to + 1;
    const chapter = this.manifest.chapters[index];
    if (!chapter) return;
    const html = await this.store.get(chapter.id);
    if (this.destroyed) return;
    const section = this.createSection(index, html);
    this.inner.appendChild(section);
    this.sections.set(index, section);
    this.to = index;
  }

  private async prepend(): Promise<void> {
    const index = this.from - 1;
    const chapter = this.manifest.chapters[index];
    if (!chapter) return;
    const html = await this.store.get(chapter.id);
    if (this.destroyed) return;
    const section = this.createSection(index, html);
    const before = this.el.scrollHeight;
    this.inner.prepend(section);
    this.el.scrollTop += this.el.scrollHeight - before;
    this.sections.set(index, section);
    this.from = index;
  }

  private createSection(index: number, html: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'rd-scroll-chapter';
    section.dataset.chapterIndex = String(index);
    section.innerHTML = scopeSvgIds(html, 'scroll-');
    decorateBlocks(section);
    const chapterId = this.manifest.chapters[index]?.id;
    if (chapterId) this.callbacks.decorate?.(section, chapterId);
    return section;
  }

  /** Vuelve a decorar los capítulos montados (tras cambiar subrayados, checklists…). */
  redecorate(): void {
    for (const [index, section] of this.sections) {
      const chapterId = this.manifest.chapters[index]?.id;
      if (chapterId) this.callbacks.decorate?.(section, chapterId);
    }
  }

  /** Contenedor del texto visible (para la selección y los subrayados). */
  container(): HTMLElement {
    return this.inner;
  }

  /** Mantiene al menos una pantalla y media dibujada por delante y por detrás. */
  private async fill(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const margin = this.el.clientHeight * 1.5;
      while (
        !this.destroyed &&
        this.to < this.manifest.chapters.length - 1 &&
        this.el.scrollTop + this.el.clientHeight > this.el.scrollHeight - margin
      ) {
        await this.append();
      }
      if (!this.destroyed && this.from > 0 && this.el.scrollTop < margin) await this.prepend();
    } finally {
      this.loading = false;
    }
  }

  private onScroll = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.report();
      this.fill().catch(() => {});
    });
  };

  private report(): void {
    const rect = this.el.getBoundingClientRect();
    const probeY = rect.top + this.topInset() + 4;
    const probeX = rect.left + rect.width / 2;
    const hit = document.elementFromPoint(probeX, probeY);
    const block = hit?.closest('article.chapter > [data-b]') as HTMLElement | null;
    const section = (block ?? hit)?.closest('.rd-scroll-chapter') as HTMLElement | null;
    const index = Number(section?.dataset.chapterIndex ?? this.from);
    const chars = (block?.textContent ?? '').length;
    let charOffset = 0;
    let wordsInChapter = 0;
    if (block) {
      const r = block.getBoundingClientRect();
      const fraction = r.height > 0 ? Math.min(1, Math.max(0, (probeY - r.top) / r.height)) : 0;
      charOffset = Math.round(fraction * chars);
      const article = block.parentElement as HTMLElement | null;
      const start = Number(block.dataset.w ?? 0);
      const nextStart = Number(
        (block.nextElementSibling as HTMLElement | null)?.dataset.w ??
          article?.dataset.words ??
          start,
      );
      wordsInChapter = start + fraction * Math.max(0, nextStart - start);
    }
    const atEnd =
      this.to === this.manifest.chapters.length - 1 &&
      this.el.scrollTop + this.el.clientHeight >= this.el.scrollHeight - 4;
    this.callbacks.onPosition(
      index,
      { blockId: block?.dataset.b ?? '', charOffset },
      wordsInChapter,
      atEnd,
    );
  }

  private onDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    this.down = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      delegated: Boolean(target?.closest(INTERACTIVE_SELECTOR)),
    };
  };

  private onUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = null;
    if (!down || down.delegated) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const selection = window.getSelection();
    if (moved > TAP_MAX_MOVEMENT || event.timeStamp - down.t > TAP_MAX_DURATION) return;
    if (selection && !selection.isCollapsed) return;
    this.callbacks.onTapCenter();
  };
}
