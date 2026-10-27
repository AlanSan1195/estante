import type { ReaderPreferences } from '../../core/domain/preferences';
import type { PreferencesRepository } from '../../core/ports/PreferencesRepository';
import { openEstanteDb } from './db';

const KEY = 'reader';
/** Copia mínima en localStorage para pintar el tema correcto antes de que cargue IndexedDB. */
export const THEME_HINT_KEY = 'estante:theme';

export class IdbPreferencesRepository implements PreferencesRepository {
  async load(): Promise<Partial<ReaderPreferences> | null> {
    const db = await openEstanteDb();
    return (await db.get('preferences', KEY)) ?? null;
  }

  async save(preferences: ReaderPreferences): Promise<void> {
    const db = await openEstanteDb();
    await db.put('preferences', preferences, KEY);
    writeThemeHint(preferences);
  }
}

export function writeThemeHint(preferences: Pick<ReaderPreferences, 'theme' | 'appearance'>): void {
  try {
    localStorage.setItem(
      THEME_HINT_KEY,
      JSON.stringify({ theme: preferences.theme, appearance: preferences.appearance }),
    );
  } catch {
    // Modo privado o almacenamiento bloqueado: el tema se aplica al cargar IndexedDB.
  }
}
