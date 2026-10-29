/** Un documento fuente tal como llega de la carpeta `projects/` (u otra fuente futura). */
export interface SourceDocument {
  /** Slug del libro derivado del nombre del archivo (`INFO_PROYECT_TWICK 2.md` → `twick-2`). */
  slug: string;
  fileName: string;
  markdown: string;
  /** Fecha de modificación (ISO). */
  updatedAt: string;
  /** Portada aportada por el usuario, si existe. */
  cover: { extension: 'jpg' | 'png' | 'webp' | 'svg'; bytes: Uint8Array } | null;
}

/** Puerto de entrada: de dónde salen los MD. Hoy una carpeta; mañana, subidas desde la UI. */
export interface ProjectSource {
  list(): Promise<SourceDocument[]>;
}
