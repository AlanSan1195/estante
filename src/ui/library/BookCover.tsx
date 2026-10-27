import type { CatalogEntry } from '../../core/domain/published';
import { coverTransitionName } from './useProgress';

interface BookCoverProps {
  book: Pick<CatalogEntry, 'slug' | 'title' | 'cover' | 'palette'>;
  /** Participa en la transición portada ↔ lector (solo una portada por libro y página). */
  transition?: boolean;
  size?: 'grid' | 'hero' | 'row' | 'thumb';
  eager?: boolean;
}

/** Portada con sombra de libro físico y lomo iluminado (como el estante de Apple Books). */
export function BookCover({
  book,
  transition = true,
  size = 'grid',
  eager = false,
}: BookCoverProps) {
  return (
    <span
      className={`cover cover-${size}`}
      style={{
        viewTransitionName: transition ? coverTransitionName(book.slug) : undefined,
        background: book.palette.background,
      }}
    >
      <img
        src={book.cover}
        alt={`Portada de ${book.title}`}
        width={400}
        height={600}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
