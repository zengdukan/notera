import {
  adfDocumentSchema,
  MAX_ADF_BYTES,
  MAX_ADF_DEPTH,
  MAX_ADF_NODES,
} from '../adf';

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

  it('enforces the exact UTF-8 byte limit', () => {
    const overhead = new TextEncoder().encode(
      JSON.stringify({ type: 'doc', version: 1, content: [''] }),
    ).byteLength;
    const atLimit = {
      type: 'doc',
      version: 1,
      content: ['x'.repeat(MAX_ADF_BYTES - overhead)],
    };
    const overLimit = {
      ...atLimit,
      content: ['x'.repeat(MAX_ADF_BYTES - overhead + 1)],
    };

    expect(adfDocumentSchema.safeParse(atLimit).success).toBe(true);
    expect(adfDocumentSchema.safeParse(overLimit).success).toBe(false);
  });

  it('enforces the exact node and nesting limits without stack overflow', () => {
    const atNodeLimit = {
      type: 'doc',
      version: 1,
      content: Array.from({ length: MAX_ADF_NODES - 4 }, () => null),
    };
    const overNodeLimit = {
      type: 'doc',
      version: 1,
      content: Array.from({ length: MAX_ADF_NODES - 3 }, () => null),
    };
    const atDepthLimit = {
      type: 'doc',
      version: 1,
      content: [nestedArray(MAX_ADF_DEPTH - 2)],
    };
    const overDepthLimit = {
      type: 'doc',
      version: 1,
      content: [nestedArray(MAX_ADF_DEPTH - 1)],
    };

    expect(adfDocumentSchema.safeParse(atNodeLimit).success).toBe(true);
    expect(adfDocumentSchema.safeParse(overNodeLimit).success).toBe(false);
    expect(adfDocumentSchema.safeParse(atDepthLimit).success).toBe(true);
    expect(adfDocumentSchema.safeParse(overDepthLimit).success).toBe(false);
  });
});
