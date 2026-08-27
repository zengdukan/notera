import type { EditorActions } from '@atlaskit/editor-core';

import { createMathAdf, type OpenMathEditor } from './types';

type MathEditorActions = Pick<EditorActions, 'focus' | 'replaceSelection'>;

export async function insertMathFromToolbar(
  openMathEditor: OpenMathEditor,
  editorActions: MathEditorActions | null,
): Promise<boolean> {
  if (!editorActions) return false;

  const latex = await openMathEditor({ kind: 'block', latex: '' });
  if (latex === undefined) return false;

  const inserted = editorActions.replaceSelection(
    createMathAdf('block', latex),
  );
  if (inserted) editorActions.focus();
  return inserted;
}
