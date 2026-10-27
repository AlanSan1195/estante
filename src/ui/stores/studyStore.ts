import { create } from 'zustand';
import type {
  Bookmark,
  ChecklistState,
  Highlight,
  HighlightColor,
} from '../../core/domain/annotations';
import type { ViewportRect } from '../../reader-engine/types';
import { annotationRepository } from '../services';

/** Fragmento seleccionado dentro de un bloque, listo para convertirse en subrayado. */
export interface SelectionPart {
  chapterId: string;
  blockId: string;
  start: number;
  end: number;
  quote: string;
}

export type Toolbar =
  | { kind: 'selection'; rect: ViewportRect; parts: SelectionPart[] }
  | { kind: 'highlight'; rect: ViewportRect; highlightId: string };

interface StudyState {
  slug: string | null;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  checklist: ChecklistState;
  /** Preguntas con la respuesta revelada (solo durante la sesión, como al estudiar en papel). */
  revealed: ReadonlySet<string>;
  /** Sube cada vez que cambia algo que se pinta dentro del texto (el lector llama a redecorate). */
  decorVersion: number;
  termPopover: { termId: string; rect: ViewportRect } | null;
  toolbar: Toolbar | null;
  /** Subrayado cuya nota se edita en la hoja "note". */
  noteFor: string | null;
  /** Término a resaltar al abrir la hoja del glosario. */
  glossaryFocus: string | null;
  load(slug: string): Promise<void>;
  reset(): void;
  addBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  addHighlights(parts: SelectionPart[], color: HighlightColor): Promise<Highlight[]>;
  updateHighlight(id: string, patch: Partial<Pick<Highlight, 'color' | 'note'>>): Promise<void>;
  removeHighlight(id: string): Promise<void>;
  setCheck(itemId: string, checked: boolean): Promise<void>;
  toggleRevealed(questionId: string): void;
  openTerm(termId: string, rect: ViewportRect): void;
  setToolbar(toolbar: Toolbar | null): void;
  setNoteFor(id: string | null): void;
  setGlossaryFocus(termId: string | null): void;
}

const empty = {
  slug: null,
  bookmarks: [],
  highlights: [],
  checklist: {},
  revealed: new Set<string>(),
  decorVersion: 0,
  termPopover: null,
  toolbar: null,
  noteFor: null,
  glossaryFocus: null,
};

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export const useStudy = create<StudyState>((set, get) => ({
  ...empty,

  async load(slug) {
    set({ ...empty, slug, revealed: new Set() });
    const [bookmarks, highlights, checklist] = await Promise.all([
      annotationRepository.listBookmarks(slug).catch(() => []),
      annotationRepository.listHighlights(slug).catch(() => []),
      annotationRepository.getChecklist(slug).catch(() => ({})),
    ]);
    if (get().slug !== slug) return;
    set((s) => ({ bookmarks, highlights, checklist, decorVersion: s.decorVersion + 1 }));
  },

  reset() {
    set({ ...empty, revealed: new Set() });
  },

  async addBookmark(bookmark) {
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
    await annotationRepository.saveBookmark(bookmark);
  },

  async removeBookmark(id) {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    await annotationRepository.removeBookmark(id);
  },

  async addHighlights(parts, color) {
    const slug = get().slug;
    if (!slug) return [];
    const now = Date.now();
    const created: Highlight[] = parts.map((part, index) => ({
      id: newId('hl'),
      bookSlug: slug,
      chapterId: part.chapterId,
      blockId: part.blockId,
      start: part.start,
      end: part.end,
      quote: part.quote,
      color,
      note: null,
      createdAt: now + index,
    }));
    set((s) => ({ highlights: [...s.highlights, ...created], decorVersion: s.decorVersion + 1 }));
    await Promise.all(created.map((h) => annotationRepository.saveHighlight(h)));
    return created;
  },

  async updateHighlight(id, patch) {
    const current = get().highlights.find((h) => h.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    set((s) => ({
      highlights: s.highlights.map((h) => (h.id === id ? next : h)),
      decorVersion: s.decorVersion + 1,
    }));
    await annotationRepository.saveHighlight(next);
  },

  async removeHighlight(id) {
    set((s) => ({
      highlights: s.highlights.filter((h) => h.id !== id),
      decorVersion: s.decorVersion + 1,
      toolbar: s.toolbar?.kind === 'highlight' && s.toolbar.highlightId === id ? null : s.toolbar,
    }));
    await annotationRepository.removeHighlight(id);
  },

  async setCheck(itemId, checked) {
    const slug = get().slug;
    if (!slug) return;
    set((s) => {
      const checklist = { ...s.checklist };
      if (checked) checklist[itemId] = true;
      else delete checklist[itemId];
      return { checklist, decorVersion: s.decorVersion + 1 };
    });
    await annotationRepository.setChecklistItem(slug, itemId, checked);
  },

  toggleRevealed(questionId) {
    set((s) => {
      const revealed = new Set(s.revealed);
      if (revealed.has(questionId)) revealed.delete(questionId);
      else revealed.add(questionId);
      return { revealed, decorVersion: s.decorVersion + 1 };
    });
  },

  openTerm(termId, rect) {
    set({ termPopover: { termId, rect }, toolbar: null });
  },

  setToolbar(toolbar) {
    set({ toolbar });
  },

  setNoteFor(id) {
    set({ noteFor: id });
  },

  setGlossaryFocus(termId) {
    set({ glossaryFocus: termId });
  },
}));

export function createBookmarkId(): string {
  return newId('bm');
}
