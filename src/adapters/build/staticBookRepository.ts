import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BookManifest, LibraryCatalog } from '../../core/domain/published';
import type { BookRepository, PublishedBook } from '../../core/ports/BookRepository';

/** Publica los libros como archivos estáticos en `public/books`. */
export function createStaticBookRepository(outDir: string): BookRepository {
  return {
    async readManifest(slug) {
      try {
        return JSON.parse(
          await readFile(join(outDir, slug, 'manifest.json'), 'utf8'),
        ) as BookManifest;
      } catch {
        return null;
      }
    },

    async saveBook(book: PublishedBook) {
      const dir = join(outDir, book.manifest.slug);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(join(dir, 'manifest.json'), JSON.stringify(book.manifest)),
        writeFile(join(dir, 'search.json'), JSON.stringify(book.search)),
        writeFile(join(dir, book.cover.fileName), book.cover.content),
        ...book.chapters.map((chapter) => writeFile(join(dir, `${chapter.id}.html`), chapter.html)),
      ]);
    },

    async saveCatalog(catalog: LibraryCatalog) {
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'index.json'), `${JSON.stringify(catalog, null, 2)}\n`);
    },

    async prune(keepSlugs) {
      const keep = new Set(keepSlugs);
      let entries: import('node:fs').Dirent[];
      try {
        entries = await readdir(outDir, { withFileTypes: true });
      } catch {
        return [];
      }
      const removed: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory() && !keep.has(entry.name)) {
          await rm(join(outDir, entry.name), { recursive: true, force: true });
          removed.push(entry.name);
        }
      }
      return removed;
    },
  };
}
