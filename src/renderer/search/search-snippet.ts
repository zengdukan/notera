import type { HighlightRange } from './unicode-highlight';

export interface SearchSnippet {
  readonly text: string;
  readonly ranges: readonly HighlightRange[];
  readonly hasLeadingEllipsis: boolean;
  readonly hasTrailingEllipsis: boolean;
}

const CONTEXT_LENGTH = 32;
const FALLBACK_LENGTH = 72;

export function searchSnippet(
  text: string,
  ranges: readonly HighlightRange[],
): SearchSnippet {
  const points = Array.from(text);
  const firstMatch = ranges.find(
    (range) => range.start < points.length && range.end > range.start,
  );
  const start = firstMatch ? Math.max(0, firstMatch.start - CONTEXT_LENGTH) : 0;
  const end = firstMatch
    ? Math.min(points.length, firstMatch.end + CONTEXT_LENGTH)
    : Math.min(points.length, FALLBACK_LENGTH);

  return {
    text: points.slice(start, end).join(''),
    ranges: ranges
      .filter((range) => range.end > start && range.start < end)
      .map((range) => ({
        start: Math.max(range.start, start) - start,
        end: Math.min(range.end, end) - start,
      })),
    hasLeadingEllipsis: start > 0,
    hasTrailingEllipsis: end < points.length,
  };
}
