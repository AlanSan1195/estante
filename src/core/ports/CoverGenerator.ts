import type { BookPalette } from '../domain/published';

export interface CoverInput {
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  /** Color base pedido en el frontmatter (hex), o null para derivarlo del título. */
  color: string | null;
}

export interface GeneratedCover {
  svg: string;
  palette: BookPalette;
}

export interface CoverGenerator {
  palette(input: CoverInput): BookPalette;
  generate(input: CoverInput): GeneratedCover;
}
