/**
 * Decorador de capítulos del lector: aplica sobre cada copia del capítulo (capas, solapa y modo
 * desplazamiento) lo que vive en IndexedDB o en la sesión: checklists marcados, respuestas
 * reveladas y subrayados. Es idempotente; nada de esto cambia la paginación.
 */

import type { ChapterDecorator } from '../../reader-engine/types';
import { useStudy } from '../stores/studyStore';
import { paintHighlight, unwrapMarks } from './highlightDom';

export const decorateChapter: ChapterDecorator = (container, chapterId) => {
  const { checklist, revealed, highlights } = useStudy.getState();

  for (const input of container.querySelectorAll<HTMLInputElement>('input[data-check]')) {
    const id = input.dataset.check ?? '';
    input.checked = Boolean(checklist[id]);
  }

  for (const qa of container.querySelectorAll<HTMLElement>('.qa[data-q]')) {
    const open = revealed.has(qa.dataset.q ?? '');
    qa.classList.toggle('is-revealed', open);
    qa.setAttribute('aria-expanded', String(open));
  }

  unwrapMarks(container);
  for (const highlight of highlights) {
    if (highlight.chapterId !== chapterId) continue;
    const block = container.querySelector(`[data-b="${CSS.escape(highlight.blockId)}"]`);
    if (block) paintHighlight(block, highlight);
  }
};
