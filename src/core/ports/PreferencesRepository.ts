import type { ReaderPreferences } from '../domain/preferences';

export interface PreferencesRepository {
  load(): Promise<Partial<ReaderPreferences> | null>;
  save(preferences: ReaderPreferences): Promise<void>;
}
