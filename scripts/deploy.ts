/**
 * Publica tu Estante desde tu computadora: tus libros de `projects/` no están en git, así que el
 * build se hace aquí (con Mermaid y tus portadas) y se sube ya construido.
 *
 * Uso: bun run deploy [--netlify] [--allow-empty]
 *   Vercel por defecto (o ESTANTE_HOST=netlify). La primera vez, la CLI te pide iniciar sesión
 *   y elegir o crear el proyecto; después ya queda enlazado (.vercel/ o .netlify/, ignorados).
 */

import { existsSync } from 'node:fs';
import { createFsProjectSource } from '../src/adapters/build/fsProjectSource';
import { resolvePaths } from '../src/integration/composition';

const VERCEL = 'vercel@64.1.0';
const NETLIFY = 'netlify-cli@27.12.1';

const args = process.argv.slice(2);
const host =
  args.includes('--netlify') || process.env.ESTANTE_HOST === 'netlify' ? 'netlify' : 'vercel';

async function run(cmd: string[]): Promise<void> {
  console.log(`\n$ ${cmd.join(' ')}`);
  const proc = Bun.spawn(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\n✗ Falló "${cmd.join(' ')}" (código ${code}). No se publicó nada nuevo.`);
    process.exit(code);
  }
}

const paths = resolvePaths(process.cwd());
const books = await createFsProjectSource(paths.projectsDir).list();
if (books.length === 0 && !args.includes('--allow-empty')) {
  console.error(
    `No hay libros en ${paths.projectsDir}: se publicaría solo el tutorial.\n` +
      'Genera uno con /libro (o copia un INFO_PROYECT_<NOMBRE>.md) o usa --allow-empty.',
  );
  process.exit(1);
}
console.log(`Publicando ${books.length} libro(s) en ${host === 'vercel' ? 'Vercel' : 'Netlify'}…`);

await run(['bun', 'run', 'books:check']);

if (host === 'vercel') {
  // Primera vez: enlazar a mano (eliges cuenta y proyecto, o creas uno). Después, sin preguntas.
  if (!existsSync('.vercel/project.json')) await run(['bunx', VERCEL, 'link']);
  await run(['bunx', VERCEL, 'pull', '--yes', '--environment=production']);
  await run(['bunx', VERCEL, 'build', '--prod']);
  await run(['bunx', VERCEL, 'deploy', '--prebuilt', '--prod']);
} else {
  await run(['bun', 'run', 'build']);
  await run(['bunx', NETLIFY, 'deploy', '--prod', '--no-build', '--dir', 'dist']);
}

console.log(
  '\n✓ Publicado. En el teléfono, toca la nube de cada libro nuevo para tenerlo sin conexión.',
);
