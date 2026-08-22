import type { AdfDocument } from '@notera/domain';

import type { SearchHighlight } from '../types';
import { extractAdfText } from './adf-text';
import { normalizeSearchText } from './normalize';

const MAX_EXCERPT_CODE_POINTS = 2000;
const MAX_HIGHLIGHTS = 1000;
const EXCERPT_CONTEXT_CODE_POINTS = 250;

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

function matchesAt(
  source: readonly string[],
  query: readonly string[],
  offset: number,
): boolean {
  if (offset + query.length > source.length) {
    return false;
  }
  return query.every((codePoint, index) => source[offset + index] === codePoint);
}

function mergeRanges(ranges: readonly SourceRange[]): readonly SourceRange[] {
  const merged: SourceRange[] = [];
  ranges.forEach((range) => {
    const previous = merged.at(-1);
    if (previous !== undefined && range.start <= previous.end) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, range.end),
      };
    } else {
      merged.push(range);
    }
  });
  return merged;
}

function findSourceRanges(
  source: string,
  normalizedQuery: string,
): readonly SourceRange[] {
  const normalized = normalizeSearchText(source);
  const sourceCodePoints = Array.from(normalized.text);
  const queryCodePoints = Array.from(normalizedQuery);
  const ranges: SourceRange[] = [];
  if (queryCodePoints.length === 0) {
    return ranges;
  }

  for (
    let offset = 0;
    offset <= sourceCodePoints.length - queryCodePoints.length;
    offset += 1
  ) {
    if (!matchesAt(sourceCodePoints, queryCodePoints, offset)) {
      continue;
    }
    const first = normalized.sourceRanges[offset];
    const last = normalized.sourceRanges[offset + queryCodePoints.length - 1];
    if (first !== undefined && last !== undefined) {
      ranges.push({ start: first.start, end: last.end });
    }
    offset += queryCodePoints.length - 1;
  }
  return mergeRanges(ranges);
}

export interface SearchPresentation {
  readonly excerpt: string;
  readonly highlights: readonly SearchHighlight[];
}

export function createSearchPresentation(
  title: string,
  document: AdfDocument,
  normalizedQuery: string,
): SearchPresentation {
  const body = extractAdfText(document);
  const titleRanges = findSourceRanges(title, normalizedQuery);
  const bodyRanges = findSourceRanges(body, normalizedQuery);
  const bodyCodePoints = Array.from(body);
  const firstBodyMatch = bodyRanges[0];
  const excerptStart = Math.max(
    0,
    (firstBodyMatch?.start ?? 0) - EXCERPT_CONTEXT_CODE_POINTS,
  );
  const excerptEnd = Math.min(
    bodyCodePoints.length,
    excerptStart + MAX_EXCERPT_CODE_POINTS,
  );
  const excerpt = bodyCodePoints.slice(excerptStart, excerptEnd).join('');
  const highlights: SearchHighlight[] = titleRanges.map((range) => ({
    field: 'title',
    ...range,
  }));
  bodyRanges.forEach((range) => {
    if (
      highlights.length >= MAX_HIGHLIGHTS ||
      range.start < excerptStart ||
      range.end > excerptEnd
    ) {
      return;
    }
    highlights.push({
      field: 'excerpt',
      start: range.start - excerptStart,
      end: range.end - excerptStart,
    });
  });
  return { excerpt, highlights: highlights.slice(0, MAX_HIGHLIGHTS) };
}
