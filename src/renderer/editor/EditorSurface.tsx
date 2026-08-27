import type { EditorActions } from '@atlaskit/editor-core';

import type { AdfDocument } from '../../shared/ipc/adf';
import { Editor } from '../atlassian-editor/editor';
import { mediaProviderForNote } from '../atlassian-editor/media-provider';
import type { ToolbarExecutor } from './toolbar-actions';

export function EditorSurface({
  noteId,
  document,
  onChange,
  onToolbarReady,
  onEditorReady,
  shouldFocus,
}: {
  readonly noteId: string;
  readonly document: AdfDocument;
  readonly onChange: (document: AdfDocument) => void;
  readonly onToolbarReady: (execute: ToolbarExecutor) => void;
  readonly onEditorReady?: (actions: EditorActions) => void;
  readonly shouldFocus?: boolean;
}) {
  return (
    <Editor
      mediaProvider={mediaProviderForNote(noteId)}
      document={document}
      onChange={onChange}
      onToolbarReady={onToolbarReady}
      onEditorReady={onEditorReady}
      shouldFocus={shouldFocus}
    />
  );
}
