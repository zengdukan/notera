import type { EditorActions } from '@atlaskit/editor-core';

import { createMermaidAdf, type OpenMermaidEditor } from './types';

type MermaidEditorActions = Pick<EditorActions, 'focus' | 'replaceSelection'>;

export async function insertMermaidFromToolbar(
  openMermaidEditor: OpenMermaidEditor,
  editorActions: MermaidEditorActions | null,
): Promise<boolean> {
  if (!editorActions) {
    return false;
  }

  const source = await openMermaidEditor({ source: '' });
  if (source === undefined) {
    return false;
  }

  const inserted = editorActions.replaceSelection(createMermaidAdf(source));
  if (inserted) {
    editorActions.focus();
  }

  return inserted;
}
