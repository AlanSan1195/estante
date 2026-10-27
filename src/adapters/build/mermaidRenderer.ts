import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { contentHash } from '../../core/domain/text';
import type { DiagramRenderer, RenderedDiagram } from '../../core/ports/DiagramRenderer';

const RENDER_VERSION = 'mermaid-isomorphic-3';

type MermaidRenderer = (
  diagrams: string[],
  options?: { prefix?: string; mermaidConfig?: Record<string, unknown> },
) => Promise<PromiseSettledResult<{ svg: string }>[]>;

/**
 * Renderiza Mermaid a SVG en build (Playwright + Chromium) en variantes clara y oscura.
 * El resultado se cachea por hash en `.estante-cache/diagrams`; ese directorio se versiona,
 * así un build en CI sin navegador reutiliza los SVG ya generados.
 */
export function createMermaidRenderer(cacheDir: string): DiagramRenderer {
  let renderer: Promise<MermaidRenderer> | null = null;

  async function renderVariant(
    source: string,
    key: string,
    variant: 'light' | 'dark',
  ): Promise<string> {
    renderer ??= import('mermaid-isomorphic').then(
      (mod) => mod.createMermaidRenderer() as unknown as MermaidRenderer,
    );
    const render = await renderer;
    const [result] = await render([source], {
      prefix: `m${key}${variant === 'light' ? 'l' : 'd'}`,
      mermaidConfig: {
        theme: variant === 'light' ? 'neutral' : 'dark',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      },
    });
    if (!result || result.status === 'rejected') {
      throw new Error(result ? String(result.reason) : 'sin resultado');
    }
    return result.value.svg;
  }

  return {
    async render(source): Promise<RenderedDiagram> {
      const key = contentHash(`${RENDER_VERSION}\n${source}`);
      const lightPath = join(cacheDir, `${key}-light.svg`);
      const darkPath = join(cacheDir, `${key}-dark.svg`);
      try {
        const [light, dark] = await Promise.all([
          readFile(lightPath, 'utf8'),
          readFile(darkPath, 'utf8'),
        ]);
        return { light, dark };
      } catch {
        // sin caché: se renderiza
      }
      const light = await renderVariant(source, key, 'light');
      const dark = await renderVariant(source, key, 'dark');
      await mkdir(cacheDir, { recursive: true });
      await Promise.all([writeFile(lightPath, light), writeFile(darkPath, dark)]);
      return { light, dark };
    },
  };
}
