export const READER_THEMES = [
  'original',
  'tranquilo',
  'papel',
  'negrita',
  'calma',
  'enfoque',
] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

export type Appearance = 'auto' | 'light' | 'dark';
export type FontFamily = 'literata' | 'source-serif' | 'inter';
export type Margins = 'narrow' | 'normal' | 'wide';
export type PageTurn = 'curl' | 'slide' | 'scroll';

export interface ReaderPreferences {
  theme: ReaderTheme;
  appearance: Appearance;
  fontFamily: FontFamily;
  /** Multiplicador del tamaño base (1 = 18 px aprox.). */
  fontScale: number;
  lineHeight: number;
  margins: Margins;
  justify: boolean;
  bold: boolean;
  pageTurn: PageTurn;
  codeWrap: boolean;
  codeScale: number;
  /** Banco de preguntas: la respuesta se ve desenfocada hasta tocarla. */
  hideAnswers: boolean;
}

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: 'original',
  appearance: 'auto',
  fontFamily: 'literata',
  fontScale: 1,
  lineHeight: 1.55,
  margins: 'normal',
  justify: false,
  bold: false,
  pageTurn: 'curl',
  codeWrap: true,
  codeScale: 0.85,
  hideAnswers: true,
};

export const FONT_SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7] as const;

/** Siguiente paso de tamaño de letra (A− / A+). */
export function stepFontScale(current: number, direction: 1 | -1): number {
  const steps = FONT_SCALE_STEPS;
  const index = steps.findIndex((s) => s >= current - 0.001);
  const from = index === -1 ? steps.length - 1 : index;
  const next = Math.min(steps.length - 1, Math.max(0, from + direction));
  return steps[next] ?? current;
}

/** Combina preferencias guardadas (posiblemente de una versión anterior) con los valores por defecto. */
export function normalizePreferences(saved: Partial<ReaderPreferences> | null): ReaderPreferences {
  const merged = { ...DEFAULT_PREFERENCES, ...(saved ?? {}) };
  if (!READER_THEMES.includes(merged.theme)) merged.theme = DEFAULT_PREFERENCES.theme;
  merged.fontScale = Math.min(2, Math.max(0.7, Number(merged.fontScale) || 1));
  merged.lineHeight = Math.min(2.2, Math.max(1.2, Number(merged.lineHeight) || 1.55));
  merged.codeScale = Math.min(1.2, Math.max(0.6, Number(merged.codeScale) || 0.85));
  merged.hideAnswers = merged.hideAnswers !== false;
  return merged;
}
