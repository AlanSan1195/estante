import type { PracticeCard } from '../domain/practice';

export interface PracticeRepository {
  list(): Promise<PracticeCard[]>;
  save(card: PracticeCard): Promise<void>;
}
