export interface CodeHighlighter {
  /** ¿El lenguaje está soportado? (`text` siempre lo está). */
  supports(lang: string): boolean;
  /** HTML resaltado con temas claro y oscuro por variables CSS. */
  highlight(code: string, lang: string): Promise<string>;
}
