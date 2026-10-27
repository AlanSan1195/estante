import type { CalloutTone } from '../../../core/domain/book';

/**
 * Diccionario configurable de etiquetas: un párrafo que empieza con una de estas etiquetas en
 * negrita se convierte en un callout del tono indicado. El texto de la etiqueta se compara
 * completo (sin el resto del párrafo), así que las frases en negrita normales no se ven afectadas.
 */
export interface CalloutRule {
  tone: CalloutTone;
  match: RegExp;
}

export const DEFAULT_CALLOUT_RULES: CalloutRule[] = [
  { tone: 'implementado', match: /^implementado:?$/i },
  { tone: 'interpretacion', match: /^interpretaci[oó]n t[eé]cnica:?$/i },
  { tone: 'verificar', match: /^por verificar(\s*\/\s*mejorar)?:?$/i },
  { tone: 'evolucion', match: /^evoluci[oó]n posible:?$/i },
  { tone: 'limite', match: /^l[ií]mite( real)?:?$/i },
  { tone: 'matiz', match: /^matiz\b[^.]{0,40}:$/i },
  { tone: 'pregunta', match: /^pregunta probable:?$/i },
  {
    tone: 'nota',
    match: /^(detalle que puede sorprender|caso interesante[^.]{0,40}|nota|importante):$/i,
  },
  { tone: 'consejo', match: /^(c[oó]mo estudiar|consejo|tip):$/i },
];

/** Alertas estilo GitHub dentro de blockquotes: `> [!WARNING]`. */
export const GITHUB_ALERT_TONES: Record<string, CalloutTone> = {
  NOTE: 'nota',
  TIP: 'consejo',
  IMPORTANT: 'matiz',
  WARNING: 'aviso',
  CAUTION: 'limite',
};

/** Encabezados que son un índice escrito a mano (se reemplaza por el índice nativo). */
export const TOC_HEADING =
  /^(índice|indice|contenido|contenidos|tabla de contenidos?|table of contents|toc)\b/i;

/** Encabezado bajo el que una tabla se interpreta como glosario. */
export const GLOSSARY_HEADING = /glosario|glossary/i;
