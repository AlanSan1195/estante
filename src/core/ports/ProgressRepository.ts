import type { ReadingProgress } from '../domain/location';

export interface ProgressRepository {
  get(bookSlug: string): Promise<ReadingProgress | null>;
  list(): Promise<ReadingProgress[]>;
  save(progress: ReadingProgress): Promise<void>;
  remove(bookSlug: string): Promise<void>;
}
