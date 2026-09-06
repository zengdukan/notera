import { useEffect, useMemo, useState } from 'react';
import type { EditorActions } from '@atlaskit/editor-core';
import { AutoDismissFlag, FlagGroup } from '@atlaskit/flag';
import FailIcon from '@atlaskit/icon/core/cross-circle';
import { Box, xcss } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

import type { AdfDocument } from '../../shared/ipc/adf';
import { Editor } from '../atlassian-editor/editor';
import { mediaProviderForNote } from '../atlassian-editor/media-provider';
import {
  formatMediaUploadLimit,
  subscribeMediaUploadRejection,
  type MediaUploadRejectionFeedback,
} from '../atlassian-editor/media-upload-feedback';
import type { NotePageSize } from '../notes/NoteWorkspace';

import './EditorSurface.css';

const editorSurfaceStyles = xcss({
  height: '100%',
  width: '100%',
  minWidth: '0',
});

const EMPTY_EDITOR_CONTENT = Object.freeze([
  Object.freeze({ type: 'paragraph', content: Object.freeze([]) }),
]);

function normalizeEditorDocument(document: AdfDocument): AdfDocument {
  if (document.content && document.content.length > 0) return document;
  return Object.freeze({ ...document, content: EMPTY_EDITOR_CONTENT });
}

function MediaUploadFeedbackFlag({
  feedback,
  onDismissed,
}: {
  readonly feedback: MediaUploadRejectionFeedback;
  readonly onDismissed: () => void;
}) {
  const intl = useIntl();
  return (
    <FlagGroup
      label={intl.formatMessage({ id: 'flags.label' })}
      onDismissed={() => onDismissed()}
    >
      <AutoDismissFlag
        id={`media-upload-${feedback.noteId}`}
        icon={<FailIcon color="var(--ds-icon-danger)" label="Fail" />}
        title={intl.formatMessage({ id: 'fabric.media.errorFlagTitle' })}
        description={intl.formatMessage(
          { id: 'fabric.media.uploadRejectionFlagDescription' },
          {
            fileName: feedback.fileName,
            limit: formatMediaUploadLimit(feedback.limitBytes),
          },
        )}
      />
    </FlagGroup>
  );
}

export function EditorSurface({
  noteId,
  document,
  pageSize = 'A4',
  onChange,
  onEditorReady,
  shouldFocus,
}: {
  readonly noteId: string;
  readonly document: AdfDocument;
  readonly pageSize?: NotePageSize;
  readonly onChange: (document: AdfDocument) => void;
  readonly onEditorReady?: (actions: EditorActions) => void;
  readonly shouldFocus?: boolean;
}) {
  const editorDocument = useMemo(
    () => normalizeEditorDocument(document),
    [document],
  );
  const [uploadFeedback, setUploadFeedback] =
    useState<MediaUploadRejectionFeedback>();
  useEffect(() => {
    setUploadFeedback(undefined);
    return subscribeMediaUploadRejection(noteId, setUploadFeedback);
  }, [noteId]);

  return (
    <Box
      xcss={editorSurfaceStyles}
      data-page-size={pageSize}
      testId="note-editor-surface"
    >
      <Editor
        mediaProvider={mediaProviderForNote(noteId)}
        document={editorDocument}
        onChange={onChange}
        onEditorReady={onEditorReady}
        shouldFocus={shouldFocus}
      />
      {uploadFeedback ? (
        <MediaUploadFeedbackFlag
          feedback={uploadFeedback}
          onDismissed={() => setUploadFeedback(undefined)}
        />
      ) : null}
    </Box>
  );
}
