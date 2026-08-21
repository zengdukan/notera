import { assertDomain, failDomain } from './errors';

declare const valueBrand: unique symbol;

type BrandedNumber<Name extends string> = number & {
  readonly [valueBrand]: Name;
};
type BrandedString<Name extends string> = string & {
  readonly [valueBrand]: Name;
};

export type Timestamp = BrandedNumber<'Timestamp'>;
export type SortOrder = BrandedNumber<'SortOrder'>;
export type ContentVersion = BrandedNumber<'ContentVersion'>;
export type AttachmentByteLength = BrandedNumber<'AttachmentByteLength'>;
export type FolderName = BrandedString<'FolderName'>;
export type TagName = BrandedString<'TagName'>;

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function asTimestamp(value: unknown): Timestamp {
  assertDomain(isNonNegativeSafeInteger(value), 'INVALID_TIMESTAMP');
  return value as Timestamp;
}

export function addTimestamp(
  timestamp: Timestamp,
  durationMilliseconds: number,
): Timestamp {
  assertDomain(
    isNonNegativeSafeInteger(durationMilliseconds),
    'INVALID_TIMESTAMP',
  );
  const result = timestamp + durationMilliseconds;
  assertDomain(Number.isSafeInteger(result), 'INVALID_TIMESTAMP');
  return result as Timestamp;
}

export function asSortOrder(value: unknown): SortOrder {
  assertDomain(isNonNegativeSafeInteger(value), 'INVALID_SORT_ORDER');
  return value as SortOrder;
}

export function asContentVersion(value: unknown): ContentVersion {
  assertDomain(
    isNonNegativeSafeInteger(value) && value >= 1,
    'CONTENT_VERSION_OVERFLOW',
  );
  return value as ContentVersion;
}

export function nextContentVersion(version: ContentVersion): ContentVersion {
  if (version === Number.MAX_SAFE_INTEGER) {
    failDomain('CONTENT_VERSION_OVERFLOW');
  }
  return (version + 1) as ContentVersion;
}

export function asAttachmentByteLength(
  value: unknown,
): AttachmentByteLength {
  assertDomain(isNonNegativeSafeInteger(value), 'ATTACHMENT_TOO_LARGE');
  return value as AttachmentByteLength;
}

function asName<Name extends string>(value: unknown): BrandedString<Name> {
  assertDomain(typeof value === 'string', 'INVALID_NAME');
  const normalized = value.trim();
  assertDomain(normalized.length > 0, 'INVALID_NAME');
  return normalized as BrandedString<Name>;
}

export const asFolderName = (value: unknown): FolderName =>
  asName<'FolderName'>(value);
export const asTagName = (value: unknown): TagName =>
  asName<'TagName'>(value);
