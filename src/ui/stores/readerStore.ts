import { create } from 'zustand';
import type { BookManifest } from '../../core/domain/published';
import type { PagesInfo, ReaderPosition, ViewerRequest } from '../../reader-engine/types';

export type Sheet =
  | 'menu'
  | 'toc'
  | 'settings'
  | 'annotations'
  | 'search'
  | 'glossary'
  | 'note'
  | null;

interface ReaderState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  manifest: BookManifest | null;
  position: ReaderPosition | null;
  pages: PagesInfo | null;
  chromeVisible: boolean;
  sheet: Sheet;
  /** Posición antes del último salto (píldora "↺ pág. N"). */
  jumpBack: ReaderPosition | null;
  viewer: ViewerRequest | null;
  toast: string | null;
  setManifest(manifest: BookManifest): void;
  setReady(): void;
  setError(message: string): void;
  setPosition(position: ReaderPosition): void;
  setPages(pages: PagesInfo | null): void;
  toggleChrome(): void;
  setChrome(visible: boolean): void;
  openSheet(sheet: Sheet): void;
  setJumpBack(position: ReaderPosition | null): void;
  openViewer(viewer: ViewerRequest | null): void;
  showToast(message: string): void;
  reset(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

const initial = {
  status: 'loading' as const,
  error: null,
  manifest: null,
  position: null,
  pages: null,
  chromeVisible: false,
  sheet: null,
  jumpBack: null,
  viewer: null,
  toast: null,
};

export const useReader = create<ReaderState>((set) => ({
  ...initial,
  setManifest: (manifest) => set({ manifest }),
  setReady: () => set({ status: 'ready' }),
  setError: (message) => set({ status: 'error', error: message }),
  setPosition: (position) => set({ position }),
  setPages: (pages) => set({ pages }),
  toggleChrome: () => set((s) => ({ chromeVisible: !s.chromeVisible, sheet: null })),
  setChrome: (visible) => set({ chromeVisible: visible }),
  openSheet: (sheet) => set((s) => ({ sheet, chromeVisible: sheet ? true : s.chromeVisible })),
  setJumpBack: (position) => set({ jumpBack: position }),
  openViewer: (viewer) => set({ viewer }),
  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 1800);
  },
  reset: () => set(initial),
}));
