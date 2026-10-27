/** Orden de lectura y etiquetas de ubicaciones a partir del manifest (funciones puras). */

import type { BookManifest, ManifestChapter } from '../../core/domain/published';
import { chapterShort } from './format';

/** Clave numérica para ordenar ubicaciones como se leen: capítulo, sección, bloque y offset. */
export function readingOrderKey(
  manifest: BookManifest,
  chapterId: string,
  blockId: string,
  offset = 0,
): number {
  const chapterIndex = manifest.chapters.findIndex((c) => c.id === chapterId);
  const chapter = manifest.chapters[chapterIndex];
  const [, sectionId = '_', n = '0'] = blockId.split('.');
  let sectionIndex = 0;
  if (chapter && sectionId !== '_' && sectionId !== 'head') {
    sectionIndex = chapter.sections.findIndex((s) => s.id === sectionId) + 1;
  }
  const blockIndex = sectionId === 'head' ? -1 : Number(n) || 0;
  return (
    (chapterIndex < 0 ? 9999 : chapterIndex) * 1e9 +
    sectionIndex * 1e6 +
    (blockIndex + 1) * 1e3 +
    Math.min(999, Math.max(0, offset / 10))
  );
}

export function chapterOf(manifest: BookManifest, chapterId: string): ManifestChapter | undefined {
  return manifest.chapters.find((c) => c.id === chapterId);
}

/** "Cap. 5 · Qué es un componente…" (sección si se conoce; si no, el título del capítulo). */
export function locationLabel(manifest: BookManifest, chapterId: string, blockId: string): string {
  const chapter = chapterOf(manifest, chapterId);
  if (!chapter) return '';
  const sectionId = blockId.split('.')[1];
  const section = chapter.sections.find((s) => s.id === sectionId);
  const short = chapterShort(chapter);
  if (section) return `${short} · ${section.number ? `${section.number} ` : ''}${section.title}`;
  return short === chapter.title ? chapter.title : `${short} · ${chapter.title}`;
}
