import { defaultSchema } from '@atlaskit/adf-schema/schema-default';
import { EditorState } from '@atlaskit/editor-prosemirror/state';

import { isMermaidNode, updateMermaidNodeSource } from './double-click';
import { createMermaidAdf } from './types';

describe('Mermaid double click editing', () => {
  it('detects Mermaid extension nodes', () => {
    const node = defaultSchema.nodeFromJSON(
      createMermaidAdf('flowchart LR\nA --> B'),
    );

    expect(isMermaidNode(node)).toBe(true);
  });

  it('updates only the source parameters for a Mermaid node', () => {
    let state = EditorState.create({
      doc: defaultSchema.nodeFromJSON({
        type: 'doc',
        content: [createMermaidAdf('flowchart LR\nA --> B')],
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

    expect(
      updateMermaidNodeSource(
        view as never,
        0,
        'sequenceDiagram\nA->>B: hello',
      ),
    ).toBe(true);

    expect(state.doc.firstChild?.attrs).toMatchObject({
      extensionType: 'com.atlassian.editor.mermaid',
      extensionKey: 'mermaid:block',
      layout: 'default',
      parameters: {
        version: 1,
        source: 'sequenceDiagram\nA->>B: hello',
      },
    });
  });
});
