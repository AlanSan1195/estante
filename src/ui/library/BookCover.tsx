import type { CatalogEntry } from '../../core/domain/published';

interface BookCoverProps {
  /** Sin libro: hueco gris del esqueleto, donde aparecerá la portada al hidratar. */
  book: Pick<CatalogEntry, 'slug' | 'title' | 'cover' | 'palette'> | null;
  /** Participa en la transición portada ↔ lector (solo una por libro y página; ui/bookTransition.ts). */
  transition?: boolean;
  size?: 'grid' | 'hero' | 'row' | 'thumb';
  eager?: boolean;
}

/**
 * Portada con sombra de libro físico y lomo iluminado (como el estante de Apple Books). El hueco y
 * la portada son el mismo `<span>`: React lo conserva al cambiar uno por otro, y la transición de
 * cerrar un libro, que apunta al hueco, no se corta al hidratar Inicio.
 */
export function BookCover({
  book,
  transition = true,
  size = 'grid',
  eager = false,
}: BookCoverProps) {
  if (!book) {
    return <span className={`cover cover-${size} is-placeholder`} data-book-slot />;
  }
  return (
    <span
      className={`cover cover-${size}`}
      data-book-cover={transition ? book.slug : undefined}
      style={{ background: book.palette.background }}
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
