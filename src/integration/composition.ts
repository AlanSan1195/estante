import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { createFsProjectSource } from "../adapters/build/fsProjectSource";
import { createHtmlRenderer } from "../adapters/build/htmlRenderer";
import { createMermaidRenderer } from "../adapters/build/mermaidRenderer";
import { noopEnricher } from "../adapters/build/noopEnricher";
import { createRemarkParser } from "../adapters/build/remark/remarkParser";
import { createShikiHighlighter } from "../adapters/build/shikiHighlighter";
import { createStaticBookRepository } from "../adapters/build/staticBookRepository";
import { createSvgCoverGenerator } from "../adapters/build/svgCoverGenerator";
import {
  type CompileDependencies,
  type CompileOptions,
  type CompileReport,
  compileLibrary,
} from "../core/application/compileLibrary";
import type { ProjectSource } from "../core/ports/ProjectSource";

export interface EstantePaths {
  root: string;
  /**
   * Entrada: aquí se sueltan los INFO_PROYECT_*.md. Es personal y no se versiona (`.gitignore`).
   * `ESTANTE_PROJECTS_DIR` la cambia (las pruebas e2e usan una biblioteca de fixtures).
   */
  projectsDir: string;
  /** Libro tutorial que se muestra mientras `projectsDir` no tenga libros. */
  examplesDir: string;
  /** Salida servida por Astro como estáticos. */
  outDir: string;
  /** Caché local de diagramas renderizados (no se versiona). */
  cacheDir: string;
}

export function resolvePaths(
  root: string,
  env: Record<string, string | undefined> = process.env,
): EstantePaths {
  return {
    root,
    projectsDir: env.ESTANTE_PROJECTS_DIR
      ? resolve(root, env.ESTANTE_PROJECTS_DIR)
      : join(root, "projects"),
    examplesDir: join(root, "examples"),
    outDir: join(root, "public", "books"),
    cacheDir: join(root, ".estante-cache", "diagrams"),
  };
}

/**
 * Autor de las portadas cuando el MD no trae `author:`: quien usa esta copia de Estante
 * (`ESTANTE_AUTHOR` o el nombre de git), nunca el autor del repo original.
 */
function defaultAuthor(root: string): string {
  if (process.env.ESTANTE_AUTHOR) return process.env.ESTANTE_AUTHOR;
  const git = spawnSync("git", ["config", "user.name"], {
    cwd: root,
    encoding: "utf8",
  });
  return git.status === 0 ? git.stdout.trim() : "";
}

/** Los libros del usuario; si todavía no hay ninguno, el tutorial de `examples/`. */
function withExamples(
  projects: ProjectSource,
  examples: ProjectSource,
): ProjectSource {
  return {
    async list() {
      const own = await projects.list();
      return own.length > 0 ? own : examples.list();
    },
  };
}

/** Raíz de composición del build: aquí, y solo aquí, se eligen los adaptadores. */
export function createCompileDependencies(
  paths: EstantePaths,
): CompileDependencies {
  return {
    source: withExamples(
      createFsProjectSource(paths.projectsDir),
      createFsProjectSource(paths.examplesDir),
    ),
    parser: createRemarkParser({ defaultAuthor: defaultAuthor(paths.root) }),
    enricher: noopEnricher,
    highlighter: createShikiHighlighter(),
    diagrams: createMermaidRenderer(paths.cacheDir),
    covers: createSvgCoverGenerator(),
    renderer: createHtmlRenderer(),
    repository: createStaticBookRepository(paths.outDir),
  };
}

export function runCompile(
  paths: EstantePaths,
  options: CompileOptions = {},
): Promise<CompileReport> {
  return compileLibrary(createCompileDependencies(paths), options);
}
