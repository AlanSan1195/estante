import { useEffect, useMemo, useState } from 'react';
import { bookStatusLabel, homeSelection } from '../../core/domain/library';
import { formatPercent, type ReadingProgress } from '../../core/domain/location';
import type { CatalogEntry } from '../../core/domain/published';
import { ArrowRightIcon } from '../glass/icons';
import { currentEnvironment, type InstallPlatform, installPlatform } from '../pwa/platform';
import { usePwa } from '../pwa/pwaStore';
import { BookCover } from './BookCover';
import { readerHref, useAllProgress } from './useProgress';

/** Inicio: "Continuar leyendo" con el libro en curso, recientes y lo que queda por empezar. */
export default function HomeView({
  books,
  chapterTitles,
}: {
  books: CatalogEntry[];
  /** slug → (id de capítulo → título) para mostrar dónde vas. */
  chapterTitles: Record<string, Record<string, string>>;
}) {
  const { progress } = useAllProgress();
  const selection = useMemo(
    () => (progress ? homeSelection(books, progress) : null),
    [books, progress],
  );

  if (books.length === 0) {
    return (
      <section className="home-empty">
        <p className="home-empty-title">Tu estante está vacío</p>
        <p>
          Suelta un <code>INFO_PROYECT_&lt;NOMBRE&gt;.md</code> en <code>projects/</code> y vuelve a
          compilar: cada proyecto se convierte en un libro.
        </p>
      </section>
    );
  }

  // Mientras carga IndexedDB: esqueleto con la misma altura para que nada salte.
  if (!selection || !progress) {
    return (
      <>
        <section className="home-hero is-loading" aria-hidden="true">
          <span className="home-hero-cover-skeleton" />
          <div className="home-hero-body" />
        </section>
        <BookRow title="En tu estante" books={books} progress={null} transition={false} />
      </>
    );
  }

  const current = selection.current;
  const currentProgress = current ? progress.get(current.slug) : null;
  const chapterTitle =
    current && currentProgress
      ? chapterTitles[current.slug]?.[currentProgress.location.chapterId]
      : undefined;

  return (
    <>
      {current && currentProgress ? (
        <section className="home-hero" data-testid="continue-reading">
          <p className="home-kicker">Continuar leyendo</p>
          <a className="home-hero-card" href={readerHref(current.slug)}>
            <BookCover book={current} size="hero" eager />
            <div className="home-hero-body">
              <h2>{current.title}</h2>
              {chapterTitle ? <p className="home-hero-chapter">{chapterTitle}</p> : null}
              <div
                className="home-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(currentProgress.percent * 100)}
                aria-label="Progreso de lectura"
              >
                <span style={{ width: `${Math.round(currentProgress.percent * 100)}%` }} />
              </div>
              <p className="home-hero-percent">{formatPercent(currentProgress.percent)} leído</p>
              <span className="app-primary-button home-hero-button">
                Continuar <ArrowRightIcon />
              </span>
            </div>
          </a>
        </section>
      ) : (
        <section className="home-hero is-welcome" data-testid="home-welcome">
          <p className="home-kicker">Para estudiar hoy</p>
          <h2 className="home-welcome-title">Elige un libro y empieza a prepararte</h2>
          <p className="home-welcome-text">
            Cada proyecto es un libro: léelo por capítulos, subraya lo importante y practica las
            preguntas que tendrás que defender.
          </p>
        </section>
      )}

      {selection.recent.length > 0 ? (
        <BookRow title="Recientes" books={selection.recent} progress={progress} transition />
      ) : null}
      {selection.unopened.length > 0 ? (
        <BookRow
          title={selection.recent.length > 0 || current ? 'Por empezar' : 'En tu estante'}
          books={selection.unopened}
          progress={progress}
          transition
        />
      ) : null}
      <InstallRow />
    </>
  );
}

/** Acceso permanente a la hoja de instalación mientras la app no esté en la pantalla de inicio. */
function InstallRow() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const prompt = usePwa((s) => s.installPrompt);
  const installed = usePwa((s) => s.installed);
  useEffect(() => setPlatform(installPlatform(currentEnvironment())), []);

  if (!platform || platform === 'standalone' || installed) return null;
  // En escritorio la tarjeta lleva al teléfono (QR); instalar exige HTTPS o localhost.
  const desktop = platform === 'desktop';
  if (desktop && !prompt && !window.isSecureContext) return null;
  return (
    <button
      type="button"
      className="home-install"
      data-testid="home-install"
      onClick={() => usePwa.getState().openInstallSheet()}
    >
      <img src="/icons/icon-192.png" alt="" width={46} height={46} />
      <div>
        <strong>{desktop ? 'Ábrela en tu teléfono' : 'Añadir a pantalla de inicio'}</strong>
        <span>
          {desktop
            ? 'Escanea el código y añádela a la pantalla de inicio.'
            : 'Ábrela como app, a pantalla completa y sin conexión.'}
        </span>
      </div>
    </button>
  );
}

function BookRow({
  title,
  books,
  progress,
  transition,
}: {
  title: string;
  books: CatalogEntry[];
  progress: Map<string, ReadingProgress> | null;
  transition: boolean;
}) {
  return (
    <section className="home-row">
      <h2 className="home-row-title">{title}</h2>
      <ul className="home-row-list">
        {books.map((book) => (
          <li key={book.slug}>
            <a
              href={readerHref(book.slug)}
              className="home-row-link"
              aria-label={`Abrir ${book.title}`}
            >
              <BookCover book={book} size="row" transition={transition} />
              <span className="home-row-name">{book.title}</span>
              <span className="home-row-status">
                {progress ? bookStatusLabel(progress.get(book.slug)) : ''}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
