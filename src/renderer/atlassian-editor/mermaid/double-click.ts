import { SafePlugin } from '@atlaskit/editor-common/safe-plugin';
import type { NextEditorPlugin } from '@atlaskit/editor-common/types';
import type { Node as PMNode } from '@atlaskit/editor-prosemirror/model';
import { NodeSelection } from '@atlaskit/editor-prosemirror/state';
import type {
  EditorProps as ProseMirrorEditorProps,
  EditorView,
} from '@atlaskit/editor-prosemirror/view';

import {
  createMermaidParameters,
  getMermaidSource,
  isMermaidExtensionKey,
  MERMAID_EXTENSION_TYPE,
  type OpenMermaidEditor,
} from './types';

export function isMermaidNode(node: PMNode): boolean {
  return (
    node.type.name === 'extension' &&
    node.attrs.extensionType === MERMAID_EXTENSION_TYPE &&
    isMermaidExtensionKey(node.attrs.extensionKey)
  );
}

export function updateMermaidNodeSource(
  view: EditorView,
  nodePos: number,
  source: string,
): boolean {
  const currentNode = view.state.doc.nodeAt(nodePos);
  if (!currentNode || !isMermaidNode(currentNode)) {
    return false;
  }

  const transaction = view.state.tr
    .setNodeMarkup(nodePos, undefined, {
      ...currentNode.attrs,
      parameters: createMermaidParameters(source),
    })
    .scrollIntoView();

  view.dispatch(transaction);
  return true;
}

function selectMermaidNode(view: EditorView, nodePos: number): void {
  try {
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)),
    );
  } catch {
    // Some extension wrappers can reject node selections; editing still works.
  }
}

export function createMermaidDoubleClickPlugin(
  openMermaidEditor: OpenMermaidEditor,
) {
  const handleDoubleClickOn: NonNullable<
    ProseMirrorEditorProps['handleDoubleClickOn']
  > = (view, _pos, node, nodePos, event, direct) => {
    if (!direct || !isMermaidNode(node)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    selectMermaidNode(view, nodePos);

    void openMermaidEditor({
      source: getMermaidSource(node.attrs.parameters),
    }).then((source) => {
      if (source === undefined) {
        return;
      }

      updateMermaidNodeSource(view, nodePos, source);
    });

    return true;
  };

  return new SafePlugin({
    props: {
      handleDoubleClickOn,
    },
  });
}

export function mermaidDoubleClickPlugin(
  openMermaidEditor: OpenMermaidEditor,
): NextEditorPlugin<'mermaidDoubleClick'> {
  return () => ({
    name: 'mermaidDoubleClick',
    pmPlugins() {
      return [
        {
          name: 'mermaidDoubleClick',
          plugin: () => createMermaidDoubleClickPlugin(openMermaidEditor),
        },
      ];
    },
  });
}
