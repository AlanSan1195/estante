import type { ReadingProgress } from '../../core/domain/location';
import type { ProgressRepository } from '../../core/ports/ProgressRepository';
import { openEstanteDb } from './db';

export class IdbProgressRepository implements ProgressRepository {
  async get(bookSlug: string): Promise<ReadingProgress | null> {
    const db = await openEstanteDb();
    return (await db.get('progress', bookSlug)) ?? null;
  }

  async list(): Promise<ReadingProgress[]> {
    const db = await openEstanteDb();
    return db.getAll('progress');
  }

  async save(progress: ReadingProgress): Promise<void> {
    const db = await openEstanteDb();
    await db.put('progress', progress);
  }

  async remove(bookSlug: string): Promise<void> {
    const db = await openEstanteDb();
    await db.delete('progress', bookSlug);
  }
}

/**
 * Guarda la ubicación sin escribir en cada página: espera a que el lector se detenga un momento.
 * `flush()` fuerza la escritura (al cerrar el libro o al ocultar la pestaña).
 */
export class ProgressSaver {
  private pending: ReadingProgress | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repository: ProgressRepository,
    private readonly delayMs = 600,
  ) {}

  schedule(progress: ReadingProgress): void {
    this.pending = progress;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush().catch(() => {});
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const progress = this.pending;
    this.pending = null;
    if (progress) await this.repository.save(progress);
  }
}
