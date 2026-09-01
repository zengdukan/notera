import type { ReactNode } from 'react';
import { Box, xcss } from '@atlaskit/primitives';

const highlightStyles = xcss({
  borderRadius: 'radius.xsmall',
  color: 'color.text',
  paddingInline: 'space.025',
});

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
      <Box
        as="mark"
        backgroundColor="color.background.accent.yellow.subtler"
        key={`highlight-${range.start}-${range.end}`}
        xcss={highlightStyles}
      >
        {points.slice(range.start, range.end).join('')}
      </Box>,
    );
    offset = range.end;
  });
  if (offset < points.length) {
    nodes.push(points.slice(offset).join(''));
  }
  return nodes;
}
