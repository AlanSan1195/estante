import { idSlug } from '../../../core/domain/text';

/** ¿Es una ruta local absoluta (macOS/Linux, file:// o Windows)? */
export function isLocalAbsolute(href: string): boolean {
  return /^\/(?!\/)/.test(href) || /^file:\/\//i.test(href) || /^[A-Za-z]:[\\/]/.test(href);
}

export function isExternal(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href) || href.startsWith('//');
}

export interface ParsedRef {
  /** Ruta sin el sufijo de línea. */
  path: string;
  line: number | null;
  lineEnd: number | null;
}

/** Separa `ruta:15`, `ruta:15-20` o `ruta#L15-L20` en ruta y líneas. */
export function parseRef(href: string): ParsedRef {
  let path = href.replace(/^file:\/\//i, '');
  try {
    path = decodeURI(path);
  } catch {
    // ruta con secuencias % inválidas: se usa tal cual
  }
  let line: number | null = null;
  let lineEnd: number | null = null;
  const hashLine = path.match(/^(.*)#L(\d+)(?:-L?(\d+))?$/);
  const colonLine = path.match(/^(.*?):(\d+)(?:[-–:](\d+))?$/);
  const match = hashLine ?? colonLine;
  if (match?.[1] && !/^[A-Za-z]$/.test(match[1])) {
    path = match[1];
    line = Number(match[2]);
    lineEnd = match[3] ? Number(match[3]) : null;
  }
  return { path: path.replace(/\\/g, '/').replace(/\/+$/, '') || '/', line, lineEnd };
}

const CONTAINER_DIRS = new Set([
  'src',
  'app',
  'lib',
  'packages',
  'public',
  'test',
  'tests',
  'docs',
  'components',
  'pages',
  'scripts',
]);

function looksLikeFile(segment: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(segment) || /^(Dockerfile|Makefile|LICENSE)$/i.test(segment);
}

/**
 * Raíz del proyecto: prefijo común (por segmentos) de los directorios de todas las rutas.
 * Si un segmento del prefijo coincide con el slug del libro, se corta ahí (p. ej. `…/twick`).
 * Si no, se retroceden carpetas contenedoras típicas (`src`, `app`…).
 */
export function detectProjectRoot(paths: readonly string[], bookSlug: string): string | null {
  if (paths.length === 0) return null;
  const dirs = paths.map((p) => {
    const segments = p.split('/');
    const last = segments.at(-1) ?? '';
    return looksLikeFile(last) ? segments.slice(0, -1) : segments;
  });
  const first = dirs[0] ?? [];
  let common = first.length;
  for (const dir of dirs.slice(1)) {
    let i = 0;
    while (i < common && i < dir.length && dir[i] === first[i]) i++;
    common = i;
  }
  let prefix = first.slice(0, common);
  const baseSlug = bookSlug.replace(/-\d+$/, '');
  const matchIndex = prefix.findLastIndex((segment) => idSlug(segment) === baseSlug);
  if (matchIndex > 0) {
    prefix = prefix.slice(0, matchIndex + 1);
  } else {
    while (prefix.length > 1 && CONTAINER_DIRS.has((prefix.at(-1) ?? '').toLowerCase())) {
      prefix = prefix.slice(0, -1);
    }
  }
  const root = prefix.join('/');
  return root.length > 0 ? root : null;
}

/** Ruta relativa a la raíz; `/` representa la raíz misma. */
export function relativeToRoot(path: string, root: string | null): string {
  if (!root) return path;
  if (path === root) return '/';
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}

/** Normaliza `usuario/repo` o una URL de GitHub a `https://github.com/usuario/repo`. */
export function normalizeRepo(repo: unknown): string | null {
  if (typeof repo !== 'string' || repo.trim() === '') return null;
  const value = repo
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  if (/^https?:\/\//.test(value)) return value;
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value}`;
  return null;
}

export function repoHref(
  repo: string | null,
  branch: string,
  path: string,
  line: number | null,
  lineEnd: number | null,
): string | null {
  if (!repo) return null;
  if (path === '/' || path === '') return repo;
  const anchor = line ? `#L${line}${lineEnd ? `-L${lineEnd}` : ''}` : '';
  return `${repo}/blob/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}${anchor}`;
}
