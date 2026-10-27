import { useEffect, useMemo, useState } from 'react';
import {
  bookState,
  bookStatusLabel,
  countLabel,
  SORT_LABELS,
  type SortMode,
  sortShelf,
} from '../../core/domain/library';
import type { ReadingProgress } from '../../core/domain/location';
import { formatPercent } from '../../core/domain/location';
import {
  formatBytes,
  type OfflineRecord,
  type OfflineStatus,
  offlineLabel,
} from '../../core/domain/offline';
import type { CatalogEntry } from '../../core/domain/published';
import { GlassButton } from '../glass/GlassButton';
import {
  CheckIcon,
  CloudCheckIcon,
  CloudDownloadIcon,
  CloudIcon,
  CloudOffIcon,
  InfoIcon,
  MoreIcon,
  RestartIcon,
  SortIcon,
} from '../glass/icons';
import { Sheet } from '../reader/Sheet';
import { progressRepository } from '../services';
import { BookCover } from './BookCover';
import { type MenuItem, PopoverMenu } from './Popover';
import { useOffline } from './useOffline';
import { readerHref, useAllProgress } from './useProgress';

const SORT_KEY = 'estante:sort';
const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

function readSort(): SortMode {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    if (saved === 'recent' || saved === 'title' || saved === 'progress') return saved;
  } catch {
    // Almacenamiento bloqueado: se usa el orden por defecto.
  }
  return 'recent';
}

function writeSort(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_KEY, mode);
  } catch {
    // Sin almacenamiento: el orden dura lo que la página.
  }
}

type Menu = { kind: 'sort'; anchor: DOMRect } | { kind: 'book'; slug: string; anchor: DOMRect };

/** Estante: cuadrícula de portadas con progreso, orden y menú ••• por libro. */
export default function LibraryGrid({ books }: { books: CatalogEntry[] }) {
  const { progress, setProgress } = useAllProgress();
  const offline = useOffline();
  const [sort, setSort] = useState<SortMode>('recent');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setSort(readSort()), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const shelf = useMemo(
    () => sortShelf(books, progress ?? new Map(), progress ? sort : 'recent'),
    [books, progress, sort],
  );

  const save = async (next: ReadingProgress | null, slug: string, message: string) => {
    const map = new Map(progress ?? []);
    if (next) {
      map.set(slug, next);
      await progressRepository.save(next);
    } else {
      map.delete(slug);
      await progressRepository.remove(slug);
    }
    setProgress(map);
    setToast(message);
  };

  const toggleFinished = async (book: CatalogEntry) => {
    const current = progress?.get(book.slug) ?? null;
    if (current?.finished) {
      await save(
        {
          ...current,
          finished: false,
          percent: Math.min(current.percent, 0.98),
          updatedAt: Date.now(),
        },
        book.slug,
        'Marcado como no terminado',
      );
      return;
    }
    const first = book.slug;
    await save(
      current
        ? { ...current, finished: true, updatedAt: Date.now() }
        : {
            bookSlug: first,
            location: { chapterId: '', blockId: '', charOffset: 0 },
            percent: 1,
            updatedAt: Date.now(),
            finished: true,
          },
      book.slug,
      'Marcado como terminado',
    );
  };

  const downloadBook = async (book: CatalogEntry) => {
    try {
      const record = await offline.download(book);
      setToast(`Disponible sin conexión · ${formatBytes(record.bytes)}`);
    } catch {
      setToast('No se pudo descargar: revisa tu conexión');
    }
  };

  const removeDownload = async (book: CatalogEntry) => {
    await offline.remove(book).catch(() => {});
    setToast('Descarga eliminada');
  };

  const sortItems: MenuItem[] = (Object.keys(SORT_LABELS) as SortMode[]).map((mode) => ({
    label: SORT_LABELS[mode],
    checked: mode === sort,
    testId: `sort-${mode}`,
    onSelect: () => {
      setSort(mode);
      writeSort(mode);
      setMenu(null);
    },
  }));

  const bookItems = (book: CatalogEntry): MenuItem[] => {
    const state = bookState(progress?.get(book.slug));
    const items: MenuItem[] = [
      {
        label: state === 'finished' ? 'Marcar como no terminado' : 'Marcar como terminado',
        icon: <CheckIcon />,
        testId: 'book-toggle-finished',
        onSelect: () => {
          setMenu(null);
          toggleFinished(book).catch(() => {});
        },
      },
    ];
    if (state !== 'new') {
      items.push({
        label: confirmReset ? '¿Reiniciar? Toca para confirmar' : 'Reiniciar progreso',
        icon: <RestartIcon />,
        destructive: true,
        testId: 'book-reset',
        onSelect: () => {
          if (!confirmReset) {
            setConfirmReset(true);
            return;
          }
          setMenu(null);
          setConfirmReset(false);
          save(null, book.slug, 'Progreso reiniciado').catch(() => {});
        },
      });
    }
    const cloud = offline.status(book).state;
    if (cloud === 'none' || cloud === 'stale') {
      items.push({
        label: cloud === 'stale' ? 'Descargar versión nueva' : 'Descargar',
        icon: <CloudDownloadIcon />,
        testId: 'book-download',
        onSelect: () => {
          setMenu(null);
          downloadBook(book).catch(() => {});
        },
      });
    }
    if (cloud === 'ready' || cloud === 'stale') {
      items.push({
        label: 'Quitar descarga',
        icon: <CloudOffIcon />,
        destructive: true,
        testId: 'book-remove-download',
        onSelect: () => {
          setMenu(null);
          removeDownload(book).catch(() => {});
        },
      });
    }
    items.push({
      label: 'Detalles del libro',
      icon: <InfoIcon />,
      testId: 'book-details',
      onSelect: () => {
        setMenu(null);
        setDetails(book.slug);
      },
    });
    return items;
  };

  const openBook = menu?.kind === 'book' ? books.find((b) => b.slug === menu.slug) : null;
  const detailBook = details ? books.find((b) => b.slug === details) : null;

  return (
    <>
      <div className="shelf-tools">
        <GlassButton
          className="app-glass-button"
          aria-label={`Ordenar: ${SORT_LABELS[sort]}`}
          data-testid="sort-button"
          onClick={(event) =>
            setMenu({ kind: 'sort', anchor: event.currentTarget.getBoundingClientRect() })
          }
        >
          <SortIcon />
        </GlassButton>
      </div>

      {books.length === 0 ? (
        <div className="shelf-empty">
          <p className="shelf-empty-title">Tu estante está vacío</p>
          <p>
            Suelta un <code>INFO_PROYECT_&lt;NOMBRE&gt;.md</code> en la carpeta{' '}
            <code>projects/</code> y vuelve a compilar.
          </p>
        </div>
      ) : (
        <ul className="shelf-grid" data-testid="shelf-grid">
          {shelf.map((book) => {
            const p = progress?.get(book.slug);
            const state = bookState(p);
            return (
              <li key={book.slug} className="shelf-item" data-book={book.slug}>
                <a
                  href={readerHref(book.slug)}
                  className="shelf-link"
                  aria-label={`Abrir ${book.title}`}
                  data-testid="shelf-book"
                >
                  <BookCover book={book} />
                </a>
                <div className="shelf-meta">
                  <span className={`shelf-status is-${state}`} data-testid="book-status">
                    {progress ? bookStatusLabel(p) : ''}
                  </span>
                  <CloudButton
                    status={offline.status(book)}
                    title={book.title}
                    onDownload={() => {
                      downloadBook(book).catch(() => {});
                    }}
                    onReady={() => setToast('Disponible sin conexión')}
                  />
                  <button
                    type="button"
                    className="shelf-more"
                    aria-label={`Opciones de ${book.title}`}
                    data-testid="book-more"
                    onClick={(event) => {
                      setConfirmReset(false);
                      setMenu({
                        kind: 'book',
                        slug: book.slug,
                        anchor: event.currentTarget.getBoundingClientRect(),
                      });
                    }}
                  >
                    <MoreIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {books.length > 0 ? (
        <p className="shelf-count">{countLabel(books.length, 'libro', 'libros')}</p>
      ) : null}

      {menu?.kind === 'sort' ? (
        <PopoverMenu
          anchor={menu.anchor}
          items={sortItems}
          label="Ordenar estante"
          onClose={() => setMenu(null)}
        />
      ) : null}
      {menu?.kind === 'book' && openBook ? (
        <PopoverMenu
          anchor={menu.anchor}
          items={bookItems(openBook)}
          label={`Opciones de ${openBook.title}`}
          onClose={() => {
            setMenu(null);
            setConfirmReset(false);
          }}
        />
      ) : null}

      {detailBook ? (
        <div className="app-overlay">
          <Sheet title="Detalles" testId="book-details-sheet" onClose={() => setDetails(null)}>
            <BookDetails
              book={detailBook}
              progress={progress?.get(detailBook.slug) ?? null}
              offline={offline.supported ? offline.status(detailBook) : null}
              record={offline.record(detailBook.slug)}
            />
          </Sheet>
        </div>
      ) : null}

      {toast ? (
        <div className="glass app-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

/**
 * Nube de la portada, como en Apple Books: vacía = no descargado (tocar descarga), anillo = en
 * curso, check = disponible sin conexión, punto azul = hay una versión nueva por descargar.
 */
function CloudButton({
  status,
  title,
  onDownload,
  onReady,
}: {
  status: OfflineStatus;
  title: string;
  onDownload(): void;
  onReady(): void;
}) {
  if (status.state === 'unavailable') return null;
  const label = offlineLabel(status);
  const circumference = 2 * Math.PI * 10;
  return (
    <button
      type="button"
      className={`shelf-cloud is-${status.state}`}
      aria-label={`${label}: ${title}`}
      title={label}
      data-testid="book-cloud"
      data-state={status.state}
      disabled={status.state === 'downloading'}
      onClick={() => {
        if (status.state === 'none' || status.state === 'stale') onDownload();
        else if (status.state === 'ready') onReady();
      }}
    >
      {status.state === 'downloading' ? (
        <>
          <svg className="shelf-cloud-ring" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="track" cx="12" cy="12" r="10" />
            <circle
              className="bar"
              cx="12"
              cy="12"
              r="10"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (status.fraction ?? 0))}
              transform="rotate(-90 12 12)"
            />
          </svg>
          <CloudDownloadIcon />
        </>
      ) : status.state === 'ready' ? (
        <CloudCheckIcon />
      ) : status.state === 'stale' ? (
        <CloudDownloadIcon />
      ) : (
        <CloudIcon />
      )}
    </button>
  );
}

function offlineSummary(status: OfflineStatus, record: OfflineRecord | null): string {
  if (status.state === 'ready' && record) return `Descargado · ${formatBytes(record.bytes)}`;
  if (status.state === 'stale') return 'Versión nueva por descargar';
  if (status.state === 'downloading') return offlineLabel(status);
  return 'No descargado';
}

function BookDetails({
  book,
  progress,
  offline,
  record,
}: {
  book: CatalogEntry;
  progress: ReadingProgress | null;
  /** null si el navegador no puede guardar libros. */
  offline: OfflineStatus | null;
  record: OfflineRecord | null;
}) {
  const state = bookState(progress);
  const minutes = Math.max(1, Math.round(book.totalWords / 230));
  const reading =
    minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return (
    <div className="book-details">
      <div className="book-details-head">
        <BookCover book={book} transition={false} size="thumb" />
        <div>
          <h3>{book.title}</h3>
          {book.subtitle ? <p>{book.subtitle}</p> : null}
          <small>{book.author}</small>
        </div>
      </div>
      <dl className="book-stats">
        <div>
          <dt>Progreso</dt>
          <dd>
            {state === 'finished'
              ? 'Terminado'
              : progress
                ? formatPercent(progress.percent)
                : 'Sin empezar'}
          </dd>
        </div>
        <div>
          <dt>Capítulos</dt>
          <dd>{book.chapters}</dd>
        </div>
        <div>
          <dt>Palabras</dt>
          <dd>{book.totalWords.toLocaleString('es')}</dd>
        </div>
        <div>
          <dt>Lectura</dt>
          <dd>≈ {reading}</dd>
        </div>
        <div>
          <dt>Preguntas</dt>
          <dd>{book.questions}</dd>
        </div>
        <div>
          <dt>Términos</dt>
          <dd>{book.terms}</dd>
        </div>
        {offline ? (
          <div>
            <dt>Sin conexión</dt>
            <dd>{offlineSummary(offline, record)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="book-updated">Actualizado el {DATE.format(new Date(book.updatedAt))}</p>
      <a className="app-primary-button" href={readerHref(book.slug)}>
        {state === 'new' ? 'Empezar a leer' : state === 'finished' ? 'Leer de nuevo' : 'Continuar'}
      </a>
    </div>
  );
}
