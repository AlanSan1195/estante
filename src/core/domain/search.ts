/**
 * Búsqueda (funciones puras): normalización sin acentos para el índice y fragmentos con las
 * coincidencias marcadas para mostrar resultados. El índice MiniSearch se construye en la UI.
 */

/** Minúsculas y sin diacríticos: "Hidratación" y "hidratacion" son el mismo término. */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Términos de una consulta, normalizados y sin vacíos ni duplicados. */
export function queryTerms(query: string): string[] {
  const terms = normalizeForSearch(query)
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return [...new Set(terms)];
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

/**
 * Fragmento de `text` alrededor de la primera coincidencia de cualquiera de los términos, con las
 * coincidencias marcadas. Compara sin acentos pero devuelve el texto original.
 */
export function makeSnippet(text: string, terms: readonly string[], radius = 70): SnippetPart[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return [];
  const normalized = normalizeForSearch(clean);
  // La normalización NFD+filtro conserva la longitud en español salvo casos raros; si no, sin marcas.
  const aligned = normalized.length === clean.length;
  const hits: { start: number; end: number }[] = [];
  if (aligned) {
    for (const term of terms) {
      if (!term) continue;
      let index = normalized.indexOf(term);
      while (index !== -1) {
        hits.push({ start: index, end: index + term.length });
        index = normalized.indexOf(term, index + term.length);
      }
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const hit of hits) {
    const last = merged.at(-1);
    if (last && hit.start <= last.end) last.end = Math.max(last.end, hit.end);
    else merged.push({ ...hit });
  }
  const first = merged[0];
  let from = 0;
  let to = clean.length;
  if (clean.length > radius * 2) {
    const center = first ? first.start : 0;
    from = Math.max(0, center - radius);
    to = Math.min(clean.length, from + radius * 2);
    from = Math.max(0, to - radius * 2);
    // Ajustar a límites de palabra.
    if (from > 0) {
      const space = clean.indexOf(' ', from);
      if (space !== -1 && space < (first?.start ?? to)) from = space + 1;
    }
    if (to < clean.length) {
      const space = clean.lastIndexOf(' ', to);
      if (space > (first?.end ?? from)) to = space;
    }
  }
  const parts: SnippetPart[] = [];
  let cursor = from;
  for (const hit of merged) {
    if (hit.end <= from || hit.start >= to) continue;
    const start = Math.max(hit.start, from);
    const end = Math.min(hit.end, to);
    if (start > cursor) parts.push({ text: clean.slice(cursor, start), hit: false });
    parts.push({ text: clean.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < to) parts.push({ text: clean.slice(cursor, to), hit: false });
  if (from > 0) parts.unshift({ text: '… ', hit: false });
  if (to < clean.length) parts.push({ text: ' …', hit: false });
  return parts;
}

/** Agrupa resultados por clave conservando el orden de la primera aparición de cada grupo. */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return [...groups].map(([k, list]) => ({ key: k, items: list }));
}
