import { defaultSchema } from '@atlaskit/adf-schema/schema-default';

import { createMathAdf, MATH_EXTENSION_TYPE } from './types';

describe('math ADF contract', () => {
  it('creates and round-trips an inline extension', () => {
    const math = createMathAdf('inline', 'E = mc^2');
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [math],
        },
      ],
    };

    expect(math).toEqual({
      type: 'inlineExtension',
      attrs: {
        extensionType: MATH_EXTENSION_TYPE,
        extensionKey: 'math:inline',
        parameters: { version: 1, latex: 'E = mc^2' },
      },
    });
    const parsedMath = defaultSchema.nodeFromJSON(doc).firstChild?.firstChild;
    expect(parsedMath?.type.name).toBe('inlineExtension');
    expect(parsedMath?.attrs).toMatchObject(math.attrs);
  });

  it('creates and round-trips a block extension', () => {
    const math = createMathAdf('block', '\\int_a^b f(x)\\,dx');
    const doc = { type: 'doc', content: [math] };

    expect(math).toEqual({
      type: 'extension',
      attrs: {
        extensionType: MATH_EXTENSION_TYPE,
        extensionKey: 'math:block',
        parameters: {
          version: 1,
          latex: '\\int_a^b f(x)\\,dx',
        },
        layout: 'default',
      },
    });
    const parsedMath = defaultSchema.nodeFromJSON(doc).firstChild;
    expect(parsedMath?.type.name).toBe('extension');
    expect(parsedMath?.attrs).toMatchObject(math.attrs);
  });

  it('does not change an existing document without equations', () => {
    const doc = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Existing content' }],
        },
      ],
    };
    const pmDoc = { type: doc.type, content: doc.content };
    const parsed = defaultSchema.nodeFromJSON(pmDoc);

    expect(parsed.textContent).toBe('Existing content');
  });
});
