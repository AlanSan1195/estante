import { create } from 'zustand';
import {
  DEFAULT_PREFERENCES,
  type PageTurn,
  type ReaderPreferences,
  stepFontScale,
} from '../../core/domain/preferences';

interface PrefsState {
  prefs: ReaderPreferences;
  /** Preferencias leídas de IndexedDB (antes de eso no se guarda nada). */
  hydrated: boolean;
  /** Último modo paginado elegido, para volver a él al salir del desplazamiento continuo. */
  lastPaged: Exclude<PageTurn, 'scroll'>;
  hydrate(prefs: ReaderPreferences): void;
  update(patch: Partial<ReaderPreferences>): void;
  stepFont(direction: 1 | -1): void;
  toggleScroll(): void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: DEFAULT_PREFERENCES,
  hydrated: false,
  lastPaged: 'curl',
  hydrate(prefs) {
    set({
      prefs,
      hydrated: true,
      lastPaged: prefs.pageTurn === 'scroll' ? 'curl' : prefs.pageTurn,
    });
  },
  update(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({
      prefs,
      lastPaged: prefs.pageTurn === 'scroll' ? get().lastPaged : prefs.pageTurn,
    });
  },
  stepFont(direction) {
    get().update({ fontScale: stepFontScale(get().prefs.fontScale, direction) });
  },
  toggleScroll() {
    const { prefs, lastPaged } = get();
    get().update({ pageTurn: prefs.pageTurn === 'scroll' ? lastPaged : 'scroll' });
  },
}));
