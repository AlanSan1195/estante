import type { Bookmark, ChecklistState, Highlight } from '../domain/annotations';

export interface AnnotationRepository {
  listBookmarks(bookSlug: string): Promise<Bookmark[]>;
  saveBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  listHighlights(bookSlug: string): Promise<Highlight[]>;
  saveHighlight(highlight: Highlight): Promise<void>;
  removeHighlight(id: string): Promise<void>;
  getChecklist(bookSlug: string): Promise<ChecklistState>;
  setChecklistItem(bookSlug: string, itemId: string, checked: boolean): Promise<void>;
}
