import { defaultSchema } from '@atlaskit/adf-schema/schema-default';
import { EditorState } from '@atlaskit/editor-prosemirror/state';

import { getMathNodeKind, updateMathNodeLatex } from './double-click';
import { createMathAdf } from './types';

describe('math double click editing', () => {
  it('detects inline and block math extension nodes', () => {
    const inlineNode = defaultSchema.nodeFromJSON(createMathAdf('inline', 'x'));
    const blockNode = defaultSchema.nodeFromJSON(createMathAdf('block', 'x'));

    expect(getMathNodeKind(inlineNode)).toBe('inline');
    expect(getMathNodeKind(blockNode)).toBe('block');
  });

  it('updates only the latex parameters for a math node', () => {
    let state = EditorState.create({
      doc: defaultSchema.nodeFromJSON({
        type: 'doc',
        content: [createMathAdf('block', 'x')],
      }),
    });
    const view = {
      get state() {
        return state;
      },
      dispatch: jest.fn((transaction) => {
        state = state.apply(transaction);
      }),
    };

    expect(updateMathNodeLatex(view as never, 0, 'x^2')).toBe(true);

    expect(state.doc.firstChild?.attrs).toMatchObject({
      extensionType: 'com.atlassian.editor.math',
      extensionKey: 'math:block',
      layout: 'default',
      parameters: { version: 1, latex: 'x^2' },
    });
  });
});
