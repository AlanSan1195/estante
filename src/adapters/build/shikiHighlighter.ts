import { bundledLanguagesInfo, createHighlighter, type Highlighter } from 'shiki';
import type { CodeHighlighter } from '../../core/ports/CodeHighlighter';

const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext']);

export interface ShikiOptions {
  lightTheme?: string;
  darkTheme?: string;
}

/**
 * Resaltado en build con temas duales: `defaultColor: false` deja cada token con
 * `--shiki-light` y `--shiki-dark`, así el lector cambia de tema solo con CSS.
 */
export function createShikiHighlighter(options: ShikiOptions = {}): CodeHighlighter {
  const light = options.lightTheme ?? 'github-light';
  const dark = options.darkTheme ?? 'github-dark';
  const aliases = new Map<string, string>();
  for (const info of bundledLanguagesInfo) {
    aliases.set(info.id, info.id);
    for (const alias of info.aliases ?? []) aliases.set(alias, info.id);
  }
  let highlighter: Promise<Highlighter> | null = null;
  const loaded = new Set<string>();

  return {
    supports(lang) {
      return PLAIN.has(lang) || aliases.has(lang);
    },
    async highlight(code, lang) {
      highlighter ??= createHighlighter({ themes: [light, dark], langs: [] });
      const hl = await highlighter;
      const id = PLAIN.has(lang) ? 'text' : (aliases.get(lang) ?? 'text');
      if (id !== 'text' && !loaded.has(id)) {
        await hl.loadLanguage(id as Parameters<Highlighter['loadLanguage']>[0]);
        loaded.add(id);
      }
      return hl.codeToHtml(code, { lang: id, themes: { light, dark }, defaultColor: false });
    },
  };
}
