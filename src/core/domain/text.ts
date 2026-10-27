/** Utilidades de texto puras y deterministas que comparte todo el núcleo. */

/** Convierte un texto en un identificador ASCII estable: minúsculas, sin acentos, con guiones. */
export function idSlug(text: string, maxLength = 40): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let cut = slug.slice(0, maxLength);
  if (slug.length > maxLength) {
    // Si se cortó a mitad de palabra, se retrocede al último guion (sin quedarse demasiado corto)…
    if (slug[maxLength] !== '-') {
      const lastDash = cut.lastIndexOf('-');
      if (lastDash >= maxLength / 2) cut = cut.slice(0, lastDash);
    }
    // …y no se termina en una palabra vacía ("autenticacion-validacion-y").
    const parts = cut.split('-');
    while (parts.length > 1 && TRAILING_STOPWORDS.has(parts.at(-1) ?? '')) parts.pop();
    cut = parts.join('-');
  }
  cut = cut.replace(/-+$/g, '');
  return cut.length > 0 ? cut : 'x';
}

const TRAILING_STOPWORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'que',
  'un',
  'una',
  'y',
  'and',
  'of',
  'the',
  'to',
]);

/** Generador de slugs que deduplica añadiendo un sufijo numérico (`a`, `a-2`, `a-3`…). */
export function createIdSlugger(maxLength = 40): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = idSlug(text, maxLength);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

/** Cuenta palabras (secuencias de letras o dígitos). */
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** Lista de palabras normalizadas, útil para comparar cobertura de texto. */
export function words(text: string): string[] {
  return (text.match(WORD) ?? []).map((w) => w.toLowerCase());
}

/** Hash cyrb53: rápido, determinista y suficiente para detectar cambios de contenido (no criptográfico). */
export function contentHash(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
}

/** Hash de bytes binarios (portadas) reutilizando el mismo algoritmo. */
export function bytesHash(bytes: Uint8Array): string {
  let text = '';
  const step = Math.max(1, Math.floor(bytes.length / 65536));
  for (let i = 0; i < bytes.length; i += step) text += String.fromCharCode(bytes[i] ?? 0);
  return contentHash(`${bytes.length}:${text}`);
}

/** Pone en mayúscula la primera letra. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}
