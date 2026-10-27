import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildPracticeQueue,
  type Grade,
  type PracticeCard,
  type PracticeFilter,
  type PracticeQuestion,
  practiceGroups,
  scheduleCard,
} from '../../core/domain/practice';
import { ArrowRightIcon } from '../glass/icons';
import { readerHref } from '../library/useProgress';
import { practiceRepository } from '../services';

export interface PracticeQuestionData extends PracticeQuestion {
  bookTitle: string;
  number: number;
  questionHtml: string;
  answerHtml: string;
  blockId: string;
}

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 0, label: 'No lo sé explicar', hint: 'Vuelve a salir hoy' },
  { grade: 1, label: 'Con ayuda', hint: 'Se queda en su caja' },
  { grade: 2, label: 'Lo explico', hint: 'Sube de caja' },
];

const DATE = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Práctica con tarjetas: pregunta → revelar → calificar 0/1/2 (la escala del propio libro).
 * El repaso sigue cajas de Leitner guardadas en IndexedDB.
 */
export default function PracticeView({
  questions,
  books,
}: {
  questions: PracticeQuestionData[];
  books: { slug: string; title: string }[];
}) {
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [filter, setFilter] = useState<PracticeFilter>({});
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sessionDone, setSessionDone] = useState(0);

  useEffect(() => {
    practiceRepository
      .list()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  const queue = useMemo(
    () => (cards ? buildPracticeQueue(questions, cards, filter, now) : null),
    [cards, questions, filter, now],
  );
  const groups = useMemo(
    () => practiceGroups(questions, filter.bookSlug ?? null),
    [questions, filter.bookSlug],
  );
  const item = queue?.items[0] ?? null;

  const grade = useCallback(
    async (value: Grade) => {
      if (!item) return;
      const at = Date.now();
      const next = scheduleCard(item.card, value, at);
      await practiceRepository.save(next);
      setCards((list) => [...(list ?? []).filter((c) => c.id !== next.id), next]);
      setRevealed(false);
      setNow(at);
      setSessionDone((n) => n + 1);
    },
    [item],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!item) return;
      if (event.key === ' ' && !revealed) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && (event.key === '0' || event.key === '1' || event.key === '2')) {
        grade(Number(event.key) as Grade).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, revealed, grade]);

  if (questions.length === 0) {
    return (
      <section className="practice-empty">
        <p className="practice-empty-title">Todavía no hay preguntas</p>
        <p>
          Las preguntas salen del banco de cada libro (párrafos como{' '}
          <code>**1. ¿Pregunta?** Respuesta</code>).
        </p>
      </section>
    );
  }

  const pending = queue ? queue.dueCount + queue.newCount : 0;

  return (
    <>
      <div className="practice-stats" data-testid="practice-stats">
        <div>
          <strong data-testid="practice-pending">{queue ? pending : '—'}</strong>
          <span>pendientes hoy</span>
        </div>
        <div>
          <strong>{queue ? queue.dueCount : '—'}</strong>
          <span>para repasar</span>
        </div>
        <div>
          <strong>{queue ? queue.masteredCount : '—'}</strong>
          <span>dominadas</span>
        </div>
      </div>

      <div className="practice-filters">
        {books.length > 1 ? (
          <label className="practice-select">
            <span className="visually-hidden">Libro</span>
            <select
              value={filter.bookSlug ?? ''}
              onChange={(event) => {
                setFilter({ bookSlug: event.target.value || null, group: null });
                setRevealed(false);
              }}
            >
              <option value="">Todos los libros</option>
              {books.map((book) => (
                <option key={book.slug} value={book.slug}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {groups.length > 1 ? (
          <fieldset className="practice-chips">
            <legend className="visually-hidden">Tema</legend>
            <button
              type="button"
              aria-pressed={!filter.group}
              onClick={() => {
                setFilter((f) => ({ ...f, group: null }));
                setRevealed(false);
              }}
            >
              Todos
            </button>
            {groups.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={filter.group === group}
                onClick={() => {
                  setFilter((f) => ({ ...f, group }));
                  setRevealed(false);
                }}
              >
                {group}
              </button>
            ))}
          </fieldset>
        ) : null}
      </div>

      {!queue ? (
        <div className="practice-card is-loading" aria-hidden="true" />
      ) : item ? (
        <article
          className="practice-card"
          data-testid="practice-card"
          data-question={item.question.questionId}
        >
          <header className="practice-card-head">
            <span>
              {item.question.bookTitle}
              {item.question.group ? ` · ${item.question.group}` : ''}
            </span>
            <span className={`practice-box${item.isNew ? ' is-new' : ''}`}>
              {item.isNew ? 'Nueva' : `Caja ${item.card.box}`}
            </span>
          </header>
          <h2 className="practice-question">
            <span className="practice-number">{item.question.number}.</span>{' '}
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generado por el pipeline */}
            <span dangerouslySetInnerHTML={{ __html: item.question.questionHtml }} />
          </h2>
          {revealed ? (
            <div
              className="practice-answer"
              data-testid="practice-answer"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generado por el pipeline
              dangerouslySetInnerHTML={{ __html: item.question.answerHtml }}
            />
          ) : (
            <p className="practice-prompt">
              Responde en voz alta: mecanismo, motivo y límite. Después compara.
            </p>
          )}
          <a
            className="practice-source"
            href={readerHref(item.question.bookSlug, item.question.blockId)}
            data-testid="practice-source"
          >
            Ver en el libro <ArrowRightIcon />
          </a>
          <footer className="practice-actions">
            {revealed ? (
              <fieldset className="practice-grades">
                <legend className="visually-hidden">¿Cómo te fue?</legend>
                {GRADES.map((g) => (
                  <button
                    key={g.grade}
                    type="button"
                    className={`practice-grade is-${g.grade}`}
                    data-testid={`grade-${g.grade}`}
                    onClick={() => {
                      grade(g.grade).catch(() => {});
                    }}
                  >
                    <strong>{g.grade}</strong>
                    <span>{g.label}</span>
                    <small>{g.hint}</small>
                  </button>
                ))}
              </fieldset>
            ) : (
              <button
                type="button"
                className="app-primary-button practice-reveal"
                data-testid="practice-reveal"
                onClick={() => setRevealed(true)}
              >
                Mostrar respuesta
              </button>
            )}
          </footer>
        </article>
      ) : (
        <section className="practice-done" data-testid="practice-done">
          <p className="practice-done-title">¡Al día!</p>
          <p>
            {sessionDone > 0
              ? `Repasaste ${sessionDone === 1 ? '1 pregunta' : `${sessionDone} preguntas`} en esta sesión.`
              : 'No te queda nada por repasar con este filtro.'}
          </p>
          {queue.nextDue ? (
            <p className="practice-next">Próximo repaso: {DATE.format(new Date(queue.nextDue))}</p>
          ) : null}
        </section>
      )}
    </>
  );
}
