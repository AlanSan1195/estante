import type { Location } from './location';

export interface Bookmark {
  id: string;
  bookSlug: string;
  location: Location;
  /** Título de sección o fragmento para mostrar en la lista. */
  label: string;
  createdAt: number;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

/**
 * Un subrayado se ancla a un bloque y a offsets de texto. La cita textual permite reanclarlo
 * si el MD cambia y los offsets ya no coinciden.
 */
export interface Highlight {
  id: string;
  bookSlug: string;
  chapterId: string;
  blockId: string;
  start: number;
  end: number;
  quote: string;
  color: HighlightColor;
  note: string | null;
  createdAt: number;
}

/** Estado de los checklists de un libro: id de ítem → marcado. */
export type ChecklistState = Record<string, boolean>;
