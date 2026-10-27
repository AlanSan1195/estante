import type { Location } from '../core/domain/location';

/** Caché de conteos de páginas por capítulo, inyectada (IndexedDB en el navegador). */
export interface PageCountCache {
  get(key: string): Promise<Record<string, number> | null>;
  set(key: string, counts: Record<string, number>): Promise<void>;
}

export type ViewMode = 'paged' | 'scroll';

/** Todo lo que la interfaz necesita saber de la posición actual. */
export interface ReaderPosition {
  mode: ViewMode;
  location: Location;
  /** 0…1 por palabras. */
  percent: number;
  chapterIndex: number;
  chapterId: string;
  chapterTitle: string;
  chapterLabel: string;
  /** Página dentro del capítulo (0-based). En modo desplazamiento es null. */
  pageInChapter: number | null;
  pagesInChapter: number | null;
  /** Página global (0-based) cuando el conteo de fondo terminó. */
  globalPage: number | null;
  totalPages: number | null;
  atStart: boolean;
  atEnd: boolean;
}

export interface PagesInfo {
  total: number;
  /** Página global (0-based) donde empieza cada capítulo, en orden del manifest. */
  chapterStarts: number[];
}

export type ViewerKind = 'code' | 'table' | 'diagram';

export interface ViewerRequest {
  kind: ViewerKind;
  html: string;
  /** Texto plano (para copiar código). */
  text: string;
  label: string | null;
}

export interface JumpInfo {
  from: ReaderPosition;
}

/** Rectángulo en coordenadas de la ventana (para colocar popovers junto al elemento tocado). */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Decora el HTML de un capítulo recién inyectado en cualquier copia (capas, solapa, desplazamiento):
 * subrayados, checklists marcados, respuestas reveladas… Debe ser idempotente: también se llama
 * con `engine.redecorate()` cuando cambian esos datos.
 */
export type ChapterDecorator = (container: HTMLElement, chapterId: string) => void;

export interface ReaderEvents {
  ready: undefined;
  location: ReaderPosition;
  /** null mientras se recalculan las páginas globales (tras cambiar tipografía o pantalla). */
  pages: PagesInfo | null;
  tapCenter: undefined;
  /** Se completó un giro de página (para ocultar los controles, como Apple Books). */
  turn: { direction: 'forward' | 'backward' };
  jump: JumpInfo;
  openViewer: ViewerRequest;
  /** Se tocó un término del glosario marcado en el texto. */
  term: { termId: string; rect: ViewportRect };
  /** Se tocó un subrayado existente. */
  highlight: { highlightId: string; rect: ViewportRect };
  /** Se tocó una pregunta del banco (para revelar u ocultar su respuesta). */
  question: { questionId: string };
  /** Cambió una casilla de un checklist. */
  check: { itemId: string; checked: boolean };
  error: { message: string };
}

export type ReaderEventName = keyof ReaderEvents;
export type Listener<K extends ReaderEventName> = (payload: ReaderEvents[K]) => void;

export class Emitter {
  private listeners = new Map<ReaderEventName, Set<(payload: never) => void>>();

  on<K extends ReaderEventName>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => set?.delete(listener as (payload: never) => void);
  }

  emit<K extends ReaderEventName>(event: K, payload: ReaderEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) (listener as Listener<K>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
