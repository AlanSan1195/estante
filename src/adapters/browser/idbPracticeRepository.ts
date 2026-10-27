import type { PracticeCard } from '../../core/domain/practice';
import type { PracticeRepository } from '../../core/ports/PracticeRepository';
import { openEstanteDb } from './db';

export class IdbPracticeRepository implements PracticeRepository {
  async list(): Promise<PracticeCard[]> {
    const db = await openEstanteDb();
    return db.getAll('practice');
  }

  async save(card: PracticeCard): Promise<void> {
    const db = await openEstanteDb();
    await db.put('practice', card);
  }
}
