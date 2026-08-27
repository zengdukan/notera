import type { EditorActions } from '@atlaskit/editor-core';

import type { AdfDocument } from '../../shared/ipc/adf';
import { Editor } from '../atlassian-editor/editor';
import type { ToolbarExecutor } from './toolbar-actions';

export function EditorSurface({
  document,
  onChange,
  onToolbarReady,
  onEditorReady,
  shouldFocus,
}: {
  readonly document: AdfDocument;
  readonly onChange: (document: AdfDocument) => void;
  readonly onToolbarReady: (execute: ToolbarExecutor) => void;
  readonly onEditorReady?: (actions: EditorActions) => void;
  readonly shouldFocus?: boolean;
}) {
  return (
    <Editor
      document={document}
      onChange={onChange}
      onToolbarReady={onToolbarReady}
      onEditorReady={onEditorReady}
      shouldFocus={shouldFocus}
    />
  );
}
