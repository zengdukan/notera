import {
  DomainError,
  asAdfDocument,
  asAttachmentByteLength,
  asContentVersion,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTagName,
  asTimestamp,
  asVaultId,
  nextContentVersion,
  addTimestamp,
} from '..';

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

function captureDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Expected DomainError');
}

describe('domain primitives', () => {
  it('brands canonical UUID values', () => {
    expect(asVaultId(VALID_UUID)).toBe(VALID_UUID);
    expect(asFolderId(VALID_UUID)).toBe(VALID_UUID);
    expect(asNoteId(VALID_UUID)).toBe(VALID_UUID);
  });

  it.each([null, '', 'not-a-uuid', VALID_UUID.toUpperCase()])(
    'rejects a non-canonical ID without echoing it: %p',
    (value) => {
      const error = captureDomainError(() => asVaultId(value));
      expect(error.code).toBe('INVALID_ID');
      expect(error.message).toBe('The identifier is invalid.');
    },
  );

  it('validates timestamps, sorting, content versions, and byte lengths', () => {
    expect(asTimestamp(0)).toBe(0);
    expect(asSortOrder(0)).toBe(0);
    expect(asContentVersion(1)).toBe(1);
    expect(asAttachmentByteLength(0)).toBe(0);

    expect(() => asTimestamp(-1)).toThrow(DomainError);
    expect(() => asSortOrder(1.5)).toThrow(DomainError);
    expect(() => asContentVersion(0)).toThrow(DomainError);
    expect(() => asAttachmentByteLength(Number.POSITIVE_INFINITY)).toThrow(
      DomainError,
    );
  });

  it('detects timestamp and content-version overflow', () => {
    expect(addTimestamp(asTimestamp(1_000), 500)).toBe(1_500);

    const timestampError = captureDomainError(() =>
      addTimestamp(asTimestamp(Number.MAX_SAFE_INTEGER), 1),
    );
    expect(timestampError.code).toBe('INVALID_TIMESTAMP');

    const versionError = captureDomainError(() =>
      nextContentVersion(asContentVersion(Number.MAX_SAFE_INTEGER)),
    );
    expect(versionError.code).toBe('CONTENT_VERSION_OVERFLOW');
  });

  it('normalizes folder and tag names without defining a length limit', () => {
    expect(asFolderName('  Projects  ')).toBe('Projects');
    expect(asTagName('  work  ')).toBe('work');
    expect(asFolderName('x'.repeat(1_000))).toHaveLength(1_000);

    const error = captureDomainError(() => asTagName('   '));
    expect(error.code).toBe('INVALID_NAME');
    expect(error.message).not.toContain('   ');
  });

  it('accepts and freezes a minimal nested ADF document', () => {
    const source = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    };

    const document = asAdfDocument(source);

    expect(document).toEqual(source);
    expect(document).not.toBe(source);
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.content)).toBe(true);
  });

  it.each([
    null,
    { type: 'paragraph', version: 1 },
    { type: 'doc', version: 2 },
    { type: 'doc', version: 1, content: {} },
    { type: 'doc', version: 1, content: [Number.NaN] },
    { type: 'doc', version: 1, content: [undefined] },
  ])('rejects an invalid ADF document', (value) => {
    const error = captureDomainError(() => asAdfDocument(value));
    expect(error.code).toBe('INVALID_ADF_DOCUMENT');
  });

  it('rejects cyclic ADF values', () => {
    const cyclic: { type: string; version: number; content: unknown[] } = {
      type: 'doc',
      version: 1,
      content: [],
    };
    cyclic.content.push(cyclic);

    expect(() => asAdfDocument(cyclic)).toThrow(DomainError);
  });

  it('clones and freezes ADF deeper than the former nesting limit', () => {
    const levels = 20_000;
    let nested: unknown = 'leaf';
    for (let index = 0; index < levels; index += 1) {
      nested = [nested];
    }

    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [nested],
    });
    let cursor: unknown = document.content?.[0];
    for (let index = 0; index < levels; index += 1) {
      expect(Object.isFrozen(cursor)).toBe(true);
      cursor = (cursor as readonly unknown[])[0];
    }

    expect(cursor).toBe('leaf');
  });
});
