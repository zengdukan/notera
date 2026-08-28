import { useMemo } from 'react';
import type { EditorActions } from '@atlaskit/editor-core';

import type { AdfDocument } from '../../shared/ipc/adf';
import { Editor } from '../atlassian-editor/editor';
import { mediaProviderForNote } from '../atlassian-editor/media-provider';
import type { ToolbarExecutor } from './toolbar-actions';

const EMPTY_EDITOR_CONTENT = Object.freeze([
  Object.freeze({ type: 'paragraph', content: Object.freeze([]) }),
]);

function normalizeEditorDocument(document: AdfDocument): AdfDocument {
  if (document.content && document.content.length > 0) return document;
  return Object.freeze({ ...document, content: EMPTY_EDITOR_CONTENT });
}

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
  const editorDocument = useMemo(
    () => normalizeEditorDocument(document),
    [document],
  );

  return (
    <Editor
      mediaProvider={mediaProviderForNote(noteId)}
      document={editorDocument}
      onChange={onChange}
      onToolbarReady={onToolbarReady}
      onEditorReady={onEditorReady}
      shouldFocus={shouldFocus}
    />
  );
}
