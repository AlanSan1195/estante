import { fileURLToPath } from "node:url";
import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import type { CompileReport } from "../core/application/compileLibrary";
import { type EstantePaths, resolvePaths, runCompile } from "./composition";
import { writeServiceWorker } from "./precache";

const WATCHED = /\.(md|jpe?g|png|webp)$/i;

function report(logger: AstroIntegrationLogger, result: CompileReport): void {
  const compiled = result.books.filter((b) => !b.skipped).length;
  logger.info(
    `${result.catalog.books.length} libro(s) en el estante · ${compiled} compilado(s) · ${result.warnings.length} aviso(s)`,
  );
  for (const w of result.warnings)
    logger.warn(`[${w.book ?? "biblioteca"}] ${w.message}`);
  if (result.pruned.length > 0)
    logger.info(`Eliminados: ${result.pruned.join(", ")}`);
}

/**
 * Integración de Astro que compila `projects/*.md` en `public/books` antes de servir o construir,
 * en desarrollo recompila y recarga al guardar un MD, y al terminar el build escribe en `sw.js`
 * la lista versionada del app shell.
 */
export default function estante(): AstroIntegration {
  let paths: EstantePaths | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Al arrancar se recompila todo (`force`): así un cambio en el código del pipeline nunca deja
   * libros viejos. En el watcher se reutilizan los libros cuyo MD no cambió (hash).
   */
  const compile = (logger: AstroIntegrationLogger, force: boolean) => {
    queue = queue
      .then(() =>
        paths
          ? runCompile(paths, { force, log: (m) => logger.debug(m) })
          : null,
      )
      .then((result) => result && report(logger, result))
      .catch((error: unknown) =>
        logger.error(`No se pudo compilar la biblioteca: ${String(error)}`),
      );
    return queue;
  };

  return {
    name: "estante",
    hooks: {
      "astro:config:setup": async ({ config, command, logger }) => {
        paths = resolvePaths(fileURLToPath(config.root));
        if (command === "preview" || command === "sync") return;
        await compile(logger, true);
      },
      "astro:server:setup": ({ server, logger }) => {
        if (!paths) return;
        const projectsDir = paths.projectsDir;
        server.watcher.add(projectsDir);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onChange = (file: string) => {
          if (!file.startsWith(projectsDir) || !WATCHED.test(file)) return;
          clearTimeout(timer);
          timer = setTimeout(async () => {
            logger.info(
              `Cambio en ${file.slice(projectsDir.length + 1)}: recompilando…`,
            );
            await compile(logger, false);
            server.ws.send({ type: "full-reload", path: "*" });
          }, 150);
        };
        server.watcher.on("add", onChange);
        server.watcher.on("change", onChange);
        server.watcher.on("unlink", onChange);
      },
      "astro:build:done": async ({ dir, logger }) => {
        const { version, files } = await writeServiceWorker(fileURLToPath(dir));
        logger.info(
          `Service worker: shell ${version} con ${files.length} archivos precargados`,
        );
      },
    },
  };
}
