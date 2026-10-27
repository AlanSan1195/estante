import type { ContentEnricher } from '../../core/ports/ContentEnricher';

/** Hoy el contenido es exactamente el del MD. Un enriquecedor con IA sería otro adaptador. */
export const noopEnricher: ContentEnricher = {
  async enrich(book) {
    return book;
  },
};
