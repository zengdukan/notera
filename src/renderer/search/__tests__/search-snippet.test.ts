import { searchSnippet } from '../search-snippet';

describe('searchSnippet', () => {
  it('keeps a short Unicode-safe context around the first excerpt match', () => {
    const text = `${'前'.repeat(40)}😀needle${'后'.repeat(40)}`;
    const snippet = searchSnippet(text, [{ start: 40, end: 47 }]);

    expect(Array.from(snippet.text)).toHaveLength(71);
    expect(snippet.text).toBe(`${'前'.repeat(32)}😀needle${'后'.repeat(32)}`);
    expect(snippet.ranges).toEqual([{ start: 32, end: 39 }]);
    expect(snippet.hasLeadingEllipsis).toBe(true);
    expect(snippet.hasTrailingEllipsis).toBe(true);
  });

  it('limits unmatched excerpt previews without splitting surrogate pairs', () => {
    const snippet = searchSnippet(`😀${'text'.repeat(30)}`, []);

    expect(Array.from(snippet.text)).toHaveLength(72);
    expect(snippet.text.startsWith('😀')).toBe(true);
    expect(snippet.ranges).toEqual([]);
    expect(snippet.hasLeadingEllipsis).toBe(false);
    expect(snippet.hasTrailingEllipsis).toBe(true);
  });
});
