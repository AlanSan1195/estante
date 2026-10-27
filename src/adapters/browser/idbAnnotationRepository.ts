import type { Bookmark, ChecklistState, Highlight } from '../../core/domain/annotations';
import type { AnnotationRepository } from '../../core/ports/AnnotationRepository';
import { openEstanteDb } from './db';

export class IdbAnnotationRepository implements AnnotationRepository {
  async listBookmarks(bookSlug: string): Promise<Bookmark[]> {
    const db = await openEstanteDb();
    const list = await db.getAllFromIndex('bookmarks', 'bookSlug', bookSlug);
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  async saveBookmark(bookmark: Bookmark): Promise<void> {
    const db = await openEstanteDb();
    await db.put('bookmarks', bookmark);
  }

  async removeBookmark(id: string): Promise<void> {
    const db = await openEstanteDb();
    await db.delete('bookmarks', id);
  }

  async listHighlights(bookSlug: string): Promise<Highlight[]> {
    const db = await openEstanteDb();
    const list = await db.getAllFromIndex('highlights', 'bookSlug', bookSlug);
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  async saveHighlight(highlight: Highlight): Promise<void> {
    const db = await openEstanteDb();
    await db.put('highlights', highlight);
  }

  async removeHighlight(id: string): Promise<void> {
    const db = await openEstanteDb();
    await db.delete('highlights', id);
  }

  async getChecklist(bookSlug: string): Promise<ChecklistState> {
    const db = await openEstanteDb();
    return (await db.get('checklists', bookSlug))?.items ?? {};
  }

  async setChecklistItem(bookSlug: string, itemId: string, checked: boolean): Promise<void> {
    const db = await openEstanteDb();
    const tx = db.transaction('checklists', 'readwrite');
    const current = (await tx.store.get(bookSlug))?.items ?? {};
    const items = { ...current };
    if (checked) items[itemId] = true;
    else delete items[itemId];
    await tx.store.put({ bookSlug, items });
    await tx.done;
  }
}
