import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { slug as githubSlug } from 'github-slugger';
import type { ProjectSource, SourceDocument } from '../../core/ports/ProjectSource';

/** `INFO_PROYECT_TWICK.md`, `INFO_PROYECT_TWICK 2.md`, `info_project_mi-app.md`… */
const SOURCE_FILE = /^INFO_PRO[YJ]ECT_(.+)\.md$/i;
const COVER_EXTENSIONS = ['jpg', 'png', 'webp'] as const;

/** Slug del libro a partir del nombre del archivo: "TWICK 2" → "twick-2". */
export function slugFromFileName(fileName: string): string | null {
  const match = fileName.match(SOURCE_FILE);
  if (!match?.[1]) return null;
  const slug = githubSlug(match[1].replace(/_/g, ' '))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '');
  return slug || null;
}

/**
 * Lee los MD de `projects/`. Acepta archivos sueltos y una subcarpeta por proyecto.
 * Portada opcional: `<slug>.cover.(jpg|png|webp)` junto al MD.
 */
export function createFsProjectSource(projectsDir: string): ProjectSource {
  return {
    async list(): Promise<SourceDocument[]> {
      const files = await findSourceFiles(projectsDir);
      const docs: SourceDocument[] = [];
      for (const file of files) {
        const slug = slugFromFileName(file.name);
        if (!slug) continue;
        const [markdown, info] = await Promise.all([readFile(file.path, 'utf8'), stat(file.path)]);
        docs.push({
          slug,
          fileName: file.name,
          markdown,
          updatedAt: info.mtime.toISOString(),
          cover: await findCover(file.dir, slug, file.name),
        });
      }
      return docs.sort((a, b) => a.slug.localeCompare(b.slug));
    },
  };
}

async function findSourceFiles(
  dir: string,
): Promise<{ name: string; path: string; dir: string }[]> {
  const out: { name: string; path: string; dir: string }[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
      out.push({ name: entry.name, path: join(dir, entry.name), dir });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const sub = join(dir, entry.name);
      for (const child of await readdir(sub, { withFileTypes: true })) {
        if (child.isFile() && SOURCE_FILE.test(child.name)) {
          out.push({ name: child.name, path: join(sub, child.name), dir: sub });
        }
      }
    }
  }
  return out;
}

async function findCover(
  dir: string,
  slug: string,
  fileName: string,
): Promise<SourceDocument['cover']> {
  const stem = fileName.replace(/\.md$/i, '');
  for (const extension of COVER_EXTENSIONS) {
    for (const base of [slug, stem]) {
      try {
        const bytes = await readFile(join(dir, `${base}.cover.${extension}`));
        return { extension, bytes: new Uint8Array(bytes) };
      } catch {
        // sin portada con ese nombre
      }
    }
  }
  return null;
}
