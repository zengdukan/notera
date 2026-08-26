import { defaultSchema } from '@atlaskit/adf-schema/schema-default';
import { EditorState } from '@atlaskit/editor-prosemirror/state';

import {
  BLOCK_MATH_PATTERN,
  createMathInputRules,
  INLINE_MATH_PATTERN,
} from './input-rules';

function stateWithParagraph(text: string) {
  return EditorState.create({
    doc: defaultSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : undefined,
        },
      ],
    }),
  });
}

describe('math input rules', () => {
  it('converts $latex$ to an inlineExtension', () => {
    const state = stateWithParagraph('$x^2$');
    const [, inlineRule] = createMathInputRules(defaultSchema);
    const match = INLINE_MATH_PATTERN.exec('$x^2$');

    expect(inlineRule).toBeDefined();
    expect(match).not.toBeNull();
    const transaction = inlineRule?.handler(state, match!, 1, 6);

    const mathNode = transaction?.doc.firstChild?.firstChild;
    expect(mathNode?.type.name).toBe('inlineExtension');
    expect(mathNode?.attrs).toMatchObject({
      extensionType: 'com.atlassian.editor.math',
      extensionKey: 'math:inline',
      parameters: { version: 1, latex: 'x^2' },
    });
  });

  it('converts a complete $$latex$$ paragraph to an extension block', () => {
    const state = stateWithParagraph('$$x^2$$');
    const [blockRule] = createMathInputRules(defaultSchema);
    const match = BLOCK_MATH_PATTERN.exec('$$x^2$$');

    expect(blockRule).toBeDefined();
    expect(match).not.toBeNull();
    const transaction = blockRule?.handler(state, match!, 1, 8);

    const mathNode = transaction?.doc.firstChild;
    expect(mathNode?.type.name).toBe('extension');
    expect(mathNode?.attrs).toMatchObject({
      extensionType: 'com.atlassian.editor.math',
      extensionKey: 'math:block',
      parameters: { version: 1, latex: 'x^2' },
      layout: 'default',
    });
  });

  it('ignores escaped, empty, cross-paragraph, and currency-like input', () => {
    expect(INLINE_MATH_PATTERN.exec('\\$x$')).toBeNull();
    expect(INLINE_MATH_PATTERN.exec('$$')).toBeNull();
    // The first closing dollar of a block expression must not prematurely
    // trigger the inline rule while the user is typing `$$latex$$`.
    expect(INLINE_MATH_PATTERN.exec('$$x^2$')).toBeNull();
    expect(INLINE_MATH_PATTERN.exec('$5')).toBeNull();
    expect(
      INLINE_MATH_PATTERN.exec('Price: $5; escaped: \\$x$; empty: $$'),
    ).toBeNull();
    expect(INLINE_MATH_PATTERN.exec('$x\ny$')).toBeNull();
    expect(BLOCK_MATH_PATTERN.exec('before $$x$$')).toBeNull();
    expect(BLOCK_MATH_PATTERN.exec('$$x\ny$$')).toBeNull();
  });
});
