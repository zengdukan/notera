import { SafePlugin } from '@atlaskit/editor-common/safe-plugin';
import type { NextEditorPlugin } from '@atlaskit/editor-common/types';
import type { Node as PMNode } from '@atlaskit/editor-prosemirror/model';
import { NodeSelection } from '@atlaskit/editor-prosemirror/state';
import type {
  EditorProps as ProseMirrorEditorProps,
  EditorView,
} from '@atlaskit/editor-prosemirror/view';

import {
  createMathParameters,
  getMathLatex,
  isMathExtensionKey,
  MATH_EXTENSION_TYPE,
  type MathKind,
  type OpenMathEditor,
} from './types';

export function getMathNodeKind(node: PMNode): MathKind | null {
  if (
    node.attrs.extensionType !== MATH_EXTENSION_TYPE ||
    !isMathExtensionKey(node.attrs.extensionKey)
  ) {
    return null;
  }

  if (node.type.name === 'inlineExtension') {
    return 'inline';
  }

  if (node.type.name === 'extension') {
    return 'block';
  }

  return null;
}

export function updateMathNodeLatex(
  view: EditorView,
  nodePos: number,
  latex: string,
): boolean {
  const currentNode = view.state.doc.nodeAt(nodePos);
  if (!currentNode || !getMathNodeKind(currentNode)) {
    return false;
  }

  const transaction = view.state.tr
    .setNodeMarkup(nodePos, undefined, {
      ...currentNode.attrs,
      parameters: createMathParameters(latex),
    })
    .scrollIntoView();

  view.dispatch(transaction);
  return true;
}

function selectMathNode(view: EditorView, nodePos: number): void {
  try {
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)),
    );
  } catch {
    // Some extension wrappers can reject node selections; editing still works.
  }
}

export function createMathDoubleClickPlugin(openMathEditor: OpenMathEditor) {
  const handleDoubleClickOn: NonNullable<
    ProseMirrorEditorProps['handleDoubleClickOn']
  > = (view, _pos, node, nodePos, event, direct) => {
    if (!direct) {
      return false;
    }

    const kind = getMathNodeKind(node);
    if (!kind) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    selectMathNode(view, nodePos);

    void openMathEditor({
      kind,
      latex: getMathLatex(node.attrs.parameters),
    }).then((latex) => {
      if (latex === undefined) {
        return;
      }

      updateMathNodeLatex(view, nodePos, latex);
    });

    return true;
  };

  return new SafePlugin({
    props: {
      handleDoubleClickOn,
    },
  });
}

export function mathDoubleClickPlugin(
  openMathEditor: OpenMathEditor,
): NextEditorPlugin<'mathDoubleClick'> {
  return () => ({
    name: 'mathDoubleClick',
    pmPlugins() {
      return [
        {
          name: 'mathDoubleClick',
          plugin: () => createMathDoubleClickPlugin(openMathEditor),
        },
      ];
    },
  });
}
