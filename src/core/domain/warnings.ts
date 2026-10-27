export type WarningCode =
  | 'toc-missing-chapter'
  | 'toc-unresolved'
  | 'chapter-numbering'
  | 'anchor-unresolved'
  | 'code-language-unknown'
  | 'diagram-failed'
  | 'duplicate-title'
  | 'duplicate-slug'
  | 'empty-book'
  | 'no-title';

export interface BuildWarning {
  code: WarningCode;
  book: string | null;
  message: string;
}

export function warning(code: WarningCode, book: string | null, message: string): BuildWarning {
  return { code, book, message };
}
