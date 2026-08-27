import type { ReactNode } from 'react';

export interface HighlightRange {
  readonly start: number;
  readonly end: number;
}

export function HighlightedText({
  text,
  ranges,
}: {
  readonly text: string;
  readonly ranges: readonly HighlightRange[];
}) {
  const points = Array.from(text);
  const nodes: ReactNode[] = [];
  let offset = 0;
  ranges.forEach((range) => {
    if (range.start > offset) {
      nodes.push(points.slice(offset, range.start).join(''));
    }
    nodes.push(
      <mark key={`highlight-${range.start}-${range.end}`}>
        {points.slice(range.start, range.end).join('')}
      </mark>,
    );
    offset = range.end;
  });
  if (offset < points.length) {
    nodes.push(points.slice(offset).join(''));
  }
  return nodes;
}
