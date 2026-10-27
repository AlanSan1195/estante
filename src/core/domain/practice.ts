/**
 * Práctica con cajas de Leitner. La nota usa la escala 0/1/2 que propone el propio libro:
 * 0 = no puedo explicarlo, 1 = necesito ayuda, 2 = lo explico y respondo una repregunta.
 */
export type Grade = 0 | 1 | 2;
export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface PracticeCard {
  /** Id de la pregunta (= blockId) prefijado con el libro: `<slug>:<blockId>`. */
  id: string;
  bookSlug: string;
  questionId: string;
  box: LeitnerBox;
  /** Fecha (epoch ms) a partir de la cual toca repasarla. */
  due: number;
  lastGrade: Grade | null;
  reviews: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Días de espera tras acertar, por caja. La caja 1 se repasa en la misma sesión. */
export const LEITNER_INTERVAL_DAYS: Record<LeitnerBox, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };

export function practiceCardId(bookSlug: string, questionId: string): string {
  return `${bookSlug}:${questionId}`;
}

export function newPracticeCard(bookSlug: string, questionId: string, now: number): PracticeCard {
  return {
    id: practiceCardId(bookSlug, questionId),
    bookSlug,
    questionId,
    box: 1,
    due: now,
    lastGrade: null,
    reviews: 0,
  };
}

/**
 * - 0 → vuelve a la caja 1 y se repite ya.
 * - 1 → se queda en su caja y espera el intervalo de esa caja (mínimo un día si no es la 1).
 * - 2 → sube una caja y espera el intervalo de la nueva caja.
 */
export function scheduleCard(card: PracticeCard, grade: Grade, now: number): PracticeCard {
  let box: LeitnerBox = card.box;
  if (grade === 0) box = 1;
  if (grade === 2) box = Math.min(5, card.box + 1) as LeitnerBox;
  const due = grade === 0 ? now : now + LEITNER_INTERVAL_DAYS[box] * DAY;
  return { ...card, box, due, lastGrade: grade, reviews: card.reviews + 1 };
}

export function isDue(card: PracticeCard, now: number): boolean {
  return card.due <= now;
}

/** Orden de repaso: primero las vencidas hace más tiempo y las de caja más baja. */
export function sortForReview(cards: readonly PracticeCard[]): PracticeCard[] {
  return [...cards].sort((a, b) => a.due - b.due || a.box - b.box || a.id.localeCompare(b.id));
}

/** Pregunta lista para practicar (lo mínimo del formato publicado que necesita la cola). */
export interface PracticeQuestion {
  bookSlug: string;
  questionId: string;
  group: string | null;
}

export interface PracticeFilter {
  bookSlug?: string | null;
  group?: string | null;
}

export interface PracticeItem<Q extends PracticeQuestion = PracticeQuestion> {
  question: Q;
  card: PracticeCard;
  /** Nunca se ha calificado. */
  isNew: boolean;
}

export interface PracticeQueue<Q extends PracticeQuestion = PracticeQuestion> {
  /** Para repasar ahora: primero las vencidas (orden de repaso) y después las nuevas (orden del libro). */
  items: PracticeItem<Q>[];
  dueCount: number;
  newCount: number;
  /** Tarjetas en la caja 5 (dominadas). */
  masteredCount: number;
  /** Próxima fecha de repaso si no queda nada para hoy. */
  nextDue: number | null;
  total: number;
}

export function matchesFilter(question: PracticeQuestion, filter: PracticeFilter): boolean {
  if (filter.bookSlug && question.bookSlug !== filter.bookSlug) return false;
  if (filter.group && question.group !== filter.group) return false;
  return true;
}

/**
 * Cola de práctica: combina las preguntas publicadas con las tarjetas guardadas. Las preguntas sin
 * tarjeta son nuevas y se repasan después de las vencidas.
 */
export function buildPracticeQueue<Q extends PracticeQuestion>(
  questions: readonly Q[],
  cards: readonly PracticeCard[],
  filter: PracticeFilter,
  now: number,
): PracticeQueue<Q> {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const due: PracticeItem<Q>[] = [];
  const fresh: PracticeItem<Q>[] = [];
  let masteredCount = 0;
  let nextDue: number | null = null;
  let total = 0;
  for (const question of questions) {
    if (!matchesFilter(question, filter)) continue;
    total++;
    const id = practiceCardId(question.bookSlug, question.questionId);
    const card = byId.get(id);
    if (!card || card.reviews === 0) {
      fresh.push({
        question,
        card: card ?? newPracticeCard(question.bookSlug, question.questionId, now),
        isNew: true,
      });
      continue;
    }
    if (card.box === 5) masteredCount++;
    if (isDue(card, now)) due.push({ question, card, isNew: false });
    else if (nextDue === null || card.due < nextDue) nextDue = card.due;
  }
  const order = new Map(sortForReview(due.map((item) => item.card)).map((c, i) => [c.id, i]));
  due.sort((a, b) => (order.get(a.card.id) ?? 0) - (order.get(b.card.id) ?? 0));
  return {
    items: [...due, ...fresh],
    dueCount: due.length,
    newCount: fresh.length,
    masteredCount,
    nextDue: due.length + fresh.length > 0 ? null : nextDue,
    total,
  };
}

/** Grupos distintos (en orden de aparición) de las preguntas de un libro o de todos. */
export function practiceGroups(
  questions: readonly PracticeQuestion[],
  bookSlug?: string | null,
): string[] {
  const seen = new Set<string>();
  for (const question of questions) {
    if (bookSlug && question.bookSlug !== bookSlug) continue;
    if (question.group) seen.add(question.group);
  }
  return [...seen];
}
