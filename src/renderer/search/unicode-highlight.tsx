import { Fragment } from 'react';

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
  const nodes = [];
  let offset = 0;
  ranges.forEach((range, index) => {
    if (range.start > offset) {
      nodes.push(
        <Fragment key={`text-${offset}`}>{points.slice(offset, range.start).join('')}</Fragment>,
      );
    }
    nodes.push(
      <mark key={`highlight-${range.start}-${index}`}>
        {points.slice(range.start, range.end).join('')}
      </mark>,
    );
    offset = range.end;
  });
  if (offset < points.length) {
    nodes.push(<Fragment key={`text-${offset}`}>{points.slice(offset).join('')}</Fragment>);
  }
  return <>{nodes}</>;
}
