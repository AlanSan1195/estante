export interface RenderedDiagram {
  light: string;
  dark: string;
}

export interface DiagramRenderer {
  /** Devuelve el SVG en variantes clara y oscura, o lanza si el diagrama no se puede renderizar. */
  render(source: string, lang: 'mermaid'): Promise<RenderedDiagram>;
  /** Libera recursos (navegador headless, etc.). */
  dispose?(): Promise<void>;
}
