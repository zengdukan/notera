import { RangeNotSatisfiableError, parseRangeHeader } from '../range';

describe('Media Adapter byte ranges', () => {
  it.each([
    ['bytes=2-5', { start: 2, endExclusive: 6 }],
    ['bytes=7-', { start: 7, endExclusive: 10 }],
    ['bytes=-3', { start: 7, endExclusive: 10 }],
  ])('parses %s as one exact range', (header, expected) => {
    expect(parseRangeHeader(header, 10)).toEqual(expected);
  });

  it.each([
    'bytes=1-2,4-5',
    'items=1-2',
    'bytes=-0',
    'bytes=10-',
    'bytes=6-5',
    'bytes=0-10',
  ])('rejects invalid, multiple, and out-of-bounds range %s', (header) => {
    expect(() => parseRangeHeader(header, 10)).toThrow(
      RangeNotSatisfiableError,
    );
  });
});
