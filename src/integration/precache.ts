import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { selectPrecache } from '../core/domain/offline';

/** Marcador de `public/sw.js` que el build reemplaza por la lista real. */
export const PRECACHE_MARKER = "/* __ESTANTE_PRECACHE__ */ { version: 'dev', files: [] }";

export interface PrecachePayload {
  version: string;
  files: string[];
}

/** Escribe la lista de precarga dentro del código del SW (así cada build cambia sus bytes). */
export function injectPrecache(swSource: string, payload: PrecachePayload): string {
  if (!swSource.includes(PRECACHE_MARKER)) {
    throw new Error('public/sw.js no contiene el marcador __ESTANTE_PRECACHE__.');
  }
  return swSource.replace(PRECACHE_MARKER, JSON.stringify(payload));
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

/** Ruta del archivo de salida que corresponde a una URL del shell (`/leer/x/` → leer/x/index.html). */
function fileOf(url: string): string {
  const path = url.replace(/^\//, '');
  return path === '' || path.endsWith('/') ? `${path}index.html` : path;
}

/**
 * Tras el build: elige el app shell, calcula una versión con el contenido de esos archivos y la
 * inyecta en `dist/sw.js`. La versión solo cambia si cambia algo del shell.
 */
export async function writeServiceWorker(outDir: string): Promise<PrecachePayload> {
  const files = selectPrecache(await listFiles(outDir));
  const hash = createHash('sha256');
  for (const url of files) {
    hash.update(url);
    hash.update(await readFile(join(outDir, fileOf(url))));
  }
  const payload: PrecachePayload = { version: hash.digest('hex').slice(0, 12), files };
  const swPath = join(outDir, 'sw.js');
  await writeFile(swPath, injectPrecache(await readFile(swPath, 'utf8'), payload));
  return payload;
}
