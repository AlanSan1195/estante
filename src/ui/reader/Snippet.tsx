import type { SnippetPart } from '../../core/domain/search';

/** Fragmento de resultado con las coincidencias resaltadas. */
export function Snippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: los fragmentos no cambian de orden
          <mark key={index} className="sr-hit">
            {part.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: los fragmentos no cambian de orden
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
