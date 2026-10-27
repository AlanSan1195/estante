import { join } from "node:path";
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

export interface EstantePaths {
  root: string;
  /** Entrada: aquí se sueltan los INFO_PROYECT_*.md. */
  projectsDir: string;
  /** Salida servida por Astro como estáticos. */
  outDir: string;
  /** Caché versionada de diagramas renderizados. */
  cacheDir: string;
}

export function resolvePaths(root: string): EstantePaths {
  return {
    root,
    projectsDir: join(root, "projects"),
    outDir: join(root, "public", "books"),
    cacheDir: join(root, ".estante-cache", "diagrams"),
  };
}

/** Raíz de composición del build: aquí, y solo aquí, se eligen los adaptadores. */
export function createCompileDependencies(
  paths: EstantePaths,
): CompileDependencies {
  return {
    source: createFsProjectSource(paths.projectsDir),
    parser: createRemarkParser(),
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
