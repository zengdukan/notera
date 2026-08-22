import { adfDocumentSchema } from '../adf';

const LEGACY_MAX_ADF_BYTES = 8 * 1024 * 1024;
const LEGACY_MAX_ADF_NODES = 100_000;
const LEGACY_MAX_ADF_DEPTH = 128;

function nestedArray(levels: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < levels; index += 1) {
    value = [value];
  }
  return value;
}

describe('ADF document schema', () => {
  it('accepts minimal and nested ADF documents', () => {
    expect(adfDocumentSchema.parse({ type: 'doc', version: 1 })).toEqual({
      type: 'doc',
      version: 1,
    });
    expect(
      adfDocumentSchema.parse({
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '你好' }] },
        ],
      }),
    ).toBeDefined();
  });

  it('rejects invalid roots and non-JSON values', () => {
    expect(() =>
      adfDocumentSchema.parse({ type: 'page', version: 1 }),
    ).toThrow();
    expect(() =>
      adfDocumentSchema.parse({ type: 'doc', version: 2 }),
    ).toThrow();
    expect(() =>
      adfDocumentSchema.parse({ type: 'doc', version: 1, content: {} }),
    ).toThrow();
    expect(() =>
      adfDocumentSchema.parse({ type: 'doc', version: 1, value: Number.NaN }),
    ).toThrow();
    expect(() =>
      adfDocumentSchema.parse({ type: 'doc', version: 1, value: BigInt(1) }),
    ).toThrow();
    expect(() =>
      adfDocumentSchema.parse({ type: 'doc', version: 1, value: undefined }),
    ).toThrow();
  });

  it('rejects cycles, custom prototypes and accessors', () => {
    const cyclic: Record<string, unknown> = { type: 'doc', version: 1 };
    cyclic.self = cyclic;
    const custom = Object.assign(Object.create({ inherited: true }), {
      type: 'doc',
      version: 1,
    });
    const accessor: Record<string, unknown> = { type: 'doc', version: 1 };
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get: () => 'do-not-read',
    });

    expect(() => adfDocumentSchema.parse(cyclic)).toThrow();
    expect(() => adfDocumentSchema.parse(custom)).toThrow();
    expect(() => adfDocumentSchema.parse(accessor)).toThrow();
  });

  it('accepts documents larger than the former UTF-8 byte limit', () => {
    const document = {
      type: 'doc',
      version: 1,
      content: ['x'.repeat(LEGACY_MAX_ADF_BYTES + 1)],
    };

    expect(adfDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('accepts documents with more values than the former node limit', () => {
    const document = {
      type: 'doc',
      version: 1,
      content: Array.from({ length: LEGACY_MAX_ADF_NODES + 1 }, () => null),
    };

    expect(adfDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('accepts documents deeper than the former nesting limit', () => {
    const document = {
      type: 'doc',
      version: 1,
      content: [nestedArray(LEGACY_MAX_ADF_DEPTH + 1)],
    };

    expect(adfDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('accepts repeated non-cyclic object references', () => {
    const paragraph = { type: 'paragraph', content: [] };
    const document = {
      type: 'doc',
      version: 1,
      content: [paragraph, paragraph],
    };

    expect(adfDocumentSchema.safeParse(document).success).toBe(true);
  });
});
