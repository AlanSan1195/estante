/**
 * Compila la biblioteca en memoria (sin escribir) y muestra estadísticas y avisos por libro.
 * Uso: bun run books:check [--strict]   (--strict sale con código 1 si hay avisos)
 */
import { resolvePaths, runCompile } from '../src/integration/composition';

const strict = process.argv.includes('--strict');
const paths = resolvePaths(process.cwd());
const started = performance.now();
const result = await runCompile(paths, { force: true, dryRun: true });
const ms = Math.round(performance.now() - started);

if (result.books.length === 0) {
  console.log(`No hay libros en ${paths.projectsDir}. Suelta ahí un INFO_PROYECT_<NOMBRE>.md.`);
}

for (const book of result.books) {
  console.log(`\n📘 ${book.title}  (${book.slug})`);
  const s = book.stats;
  if (!s) continue;
  const kinds = Object.entries(s.blocks)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${kind} ${n}`)
    .join(' · ');
  console.log(`   capítulos ${s.chapters} · palabras ${s.words.toLocaleString('es')}`);
  console.log(`   bloques: ${kinds}`);
  console.log(
    `   preguntas ${s.questions} · términos ${s.terms} · referencias a archivos ${s.fileRefs} · anclas ${s.anchors} · enlaces externos ${s.externalLinks}`,
  );
  const warnings = result.warnings.filter((w) => w.book === book.slug);
  console.log(warnings.length === 0 ? '   ✓ sin avisos' : `   ⚠ ${warnings.length} aviso(s):`);
  for (const w of warnings) console.log(`     - [${w.code}] ${w.message}`);
}

const global = result.warnings.filter((w) => !result.books.some((b) => b.slug === w.book));
for (const w of global) console.log(`⚠ [${w.code}] ${w.message}`);
console.log(`\n${result.books.length} libro(s) revisados en ${ms} ms.`);

// Playwright (Mermaid) puede dejar manejadores vivos en Bun: se cierra el proceso explícitamente.
process.exit(strict && result.warnings.length > 0 ? 1 : 0);
