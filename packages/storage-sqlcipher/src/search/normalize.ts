/// <reference path="../native/foldcase.d.ts" />

import { full } from '@ar-nelson/foldcase';

import type { NormalizedSearchText } from '../types';

export const NORMALIZER_VERSION = 1;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export function normalizeSearchText(source: string): NormalizedSearchText {
  const text: string[] = [];
  const sourceRanges: { start: number; end: number }[] = [];
  let sourceCodePoint = 0;

  for (const { segment } of graphemeSegmenter.segment(source)) {
    const sourceLength = Array.from(segment).length;
    const start = sourceCodePoint;
    const end = start + sourceLength;
    const normalized = full(segment.normalize('NFKC'));
    for (const codePoint of normalized) {
      text.push(codePoint);
      sourceRanges.push({ start, end });
    }
    sourceCodePoint = end;
  }

  return { text: text.join(''), sourceRanges };
}
