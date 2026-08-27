export interface ByteRange {
  readonly start: number;
  readonly endExclusive: number;
}

export class RangeNotSatisfiableError extends Error {
  constructor() {
    super('Range not satisfiable.');
    this.name = 'RangeNotSatisfiableError';
  }
}

function integer(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseRangeHeader(
  value: string | undefined,
  length: number,
): ByteRange | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(length) || length <= 0 || value.includes(',')) {
    throw new RangeNotSatisfiableError();
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (match === null) throw new RangeNotSatisfiableError();
  const [, rawStart, rawEnd] = match;
  if (rawStart.length === 0) {
    const suffix = integer(rawEnd);
    if (suffix === undefined || suffix <= 0 || suffix > length) {
      throw new RangeNotSatisfiableError();
    }
    return { start: length - suffix, endExclusive: length };
  }
  const start = integer(rawStart);
  if (start === undefined || start >= length) {
    throw new RangeNotSatisfiableError();
  }
  if (rawEnd.length === 0) return { start, endExclusive: length };
  const end = integer(rawEnd);
  if (end === undefined || end < start || end >= length) {
    throw new RangeNotSatisfiableError();
  }
  return { start, endExclusive: end + 1 };
}
