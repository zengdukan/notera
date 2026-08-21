import { assertDomain } from '../errors';
import type { Timestamp } from '../values';

export function assertTimestampOrder(
  createdAt: Timestamp,
  updatedAt: Timestamp,
): void {
  assertDomain(updatedAt >= createdAt, 'INVALID_TIMESTAMP');
}

export function immutable<T extends object>(value: T): Readonly<T> {
  return Object.freeze({ ...value });
}
