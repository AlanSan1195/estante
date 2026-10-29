import type { Margins, ReaderPreferences, ReaderTheme } from '../core/domain/preferences';

/** Tamaño base del texto con fontScale = 1. */
export const BASE_FONT_PX = 18;

export const MARGIN_PX: Record<Margins, number> = { narrow: 18, normal: 26, wide: 40 };

export const FONT_STACKS: Record<ReaderPreferences['fontFamily'], string> = {
  literata: "'Literata Variable', 'Iowan Old Style', Georgia, serif",
  'source-serif': "'Source Serif 4 Variable', 'Iowan Old Style', Georgia, serif",
  inter: "'Inter Variable', -apple-system, system-ui, sans-serif",
};

export const MONO_STACK = "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace";

/** Fuente pixel del tema Dev (public/fontmidUX.woff2, declarada en src/styles/themes.css). */
export const DEV_FONT_STACK =
  "'Geist Pixel Square', 'JetBrains Mono Variable', ui-monospace, monospace";

/** Fuente del texto: el tema Dev impone la suya; los demás usan la elegida en Ajustes. */
export function bodyFontStack(prefs: Pick<ReaderPreferences, 'theme' | 'fontFamily'>): string {
  return prefs.theme === 'dev' ? DEV_FONT_STACK : FONT_STACKS[prefs.fontFamily];
}

/** Lo que un tema cambia en la paginación: Negrita el peso del texto y Dev la fuente ('' = nada). */
export function themeLayout(theme: ReaderTheme): string {
  return theme === 'negrita' || theme === 'dev' ? theme : '';
}

export type ColorMode = 'light' | 'dark';

export function resolveMode(
  appearance: ReaderPreferences['appearance'],
  prefersDark: boolean,
): ColorMode {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return prefersDark ? 'dark' : 'light';
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Aplica tema y tipografía como atributos y variables CSS sobre la raíz del lector. */
export function applyPreferences(root: HTMLElement, prefs: ReaderPreferences): ColorMode {
  const mode = resolveMode(prefs.appearance, systemPrefersDark());
  root.dataset.theme = prefs.theme;
  root.dataset.mode = mode;
  root.dataset.font = prefs.fontFamily;
  root.dataset.justify = String(prefs.justify);
  root.dataset.bold = String(prefs.bold);
  root.dataset.codewrap = String(prefs.codeWrap);
  root.dataset.turn = prefs.pageTurn;
  root.dataset.hideanswers = String(prefs.hideAnswers);
  root.style.setProperty('--fs', `${(BASE_FONT_PX * prefs.fontScale).toFixed(2)}px`);
  root.style.setProperty('--lh', prefs.lineHeight.toFixed(2));
  root.style.setProperty('--mx', `${MARGIN_PX[prefs.margins]}px`);
  root.style.setProperty('--code-scale', prefs.codeScale.toFixed(2));
  root.style.setProperty('--font-body', bodyFontStack(prefs));
  root.style.setProperty('--font-mono', MONO_STACK);
  return mode;
}

/** Espera a que las fuentes del texto estén listas (con tope) para no paginar con la de reserva. */
export async function waitForFonts(prefs: ReaderPreferences, timeoutMs = 2500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const size = `${Math.round(BASE_FONT_PX * prefs.fontScale)}px`;
  const family = bodyFontStack(prefs).split(',')[0] ?? '';
  const loads = [
    document.fonts.load(`${size} ${family}`),
    document.fonts.load(`italic ${size} ${family}`),
    document.fonts.load(`600 ${size} ${family}`),
    document.fonts.load(`${size} 'JetBrains Mono Variable'`),
  ];
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.allSettled(loads).then(() => document.fonts.ready), timeout]);
}
