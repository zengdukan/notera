/** @jsxImportSource @emotion/react */
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import Button, { ButtonGroup } from '@atlaskit/button';
import ModalDialog, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';
import TextArea from '@atlaskit/textarea';
import { useIntl } from 'react-intl';

import { renderMermaid } from './mermaid';
import { MermaidEditorContext } from './mermaid-editor-context';
import {
  dialogErrorStyles,
  dialogFieldStyles,
  dialogHelpStyles,
  dialogLabelStyles,
  dialogPreviewContentStyles,
  dialogPreviewSectionStyles,
  dialogPreviewStyles,
} from './styles';
import type { MermaidEditorRequest, OpenMermaidEditor } from './types';
import { useMermaidRender } from './use-mermaid-render';

type PendingRequest = MermaidEditorRequest & {
  id: number;
  resolve: (source: string | undefined) => void;
};

function MermaidEditorDialog({
  request,
  onCancel,
  onSave,
}: {
  request: MermaidEditorRequest;
  onCancel: () => void;
  onSave: (source: string) => void;
}) {
  const intl = useIntl();
  const [source, setSource] = useState(request.source);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const preview = useMermaidRender(source, 300);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');
  const error =
    saveError ?? (preview.status === 'error' ? preview.error : null);
  const canSave =
    preview.status === 'success' && preview.source === source && !isSaving;

  const title = intl.formatMessage({
    id: 'mermaid.editor.block.title',
    defaultMessage: 'Mermaid diagram',
  });

  const save = useCallback(async () => {
    const nextSource = sourceRef.current;
    if (!nextSource.trim() || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    const result = await renderMermaid(`mermaid-save-${saveId}`, nextSource);

    if (nextSource !== sourceRef.current) {
      setIsSaving(false);
      return;
    }

    if (result.error) {
      setSaveError(result.error);
      setIsSaving(false);
      return;
    }

    onSave(nextSource);
  }, [isSaving, onSave, saveId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <ModalDialog
      autoFocus={inputRef}
      onClose={onCancel}
      shouldCloseOnOverlayClick={false}
      testId="mermaid-editor-dialog"
      width="large"
    >
      <ModalHeader hasCloseButton>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="mermaid-dialog-field" css={dialogFieldStyles}>
          <label
            className="mermaid-dialog-label"
            css={dialogLabelStyles}
            htmlFor="mermaid-source-input"
          >
            Mermaid syntax
          </label>
          <TextArea
            aria-describedby={
              error ? 'mermaid-source-error' : 'mermaid-source-help'
            }
            id="mermaid-source-input"
            isInvalid={Boolean(error)}
            isMonospaced
            maxHeight="320px"
            minimumRows={10}
            onChange={(event) => {
              setSource(event.target.value);
              setSaveError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={'flowchart LR\n  A[Start] --> B[End]'}
            ref={inputRef}
            resize="smart"
            spellCheck={false}
            testId="mermaid-source-input"
            value={source}
          />
          {error ? (
            <div
              className="mermaid-dialog-error"
              css={dialogErrorStyles}
              id="mermaid-source-error"
              role="alert"
            >
              {error}
            </div>
          ) : (
            <div
              className="mermaid-dialog-help"
              css={dialogHelpStyles}
              id="mermaid-source-help"
            >
              {preview.status === 'loading'
                ? 'Checking Mermaid syntax…'
                : 'Press Ctrl+Enter or Command+Enter to save.'}
            </div>
          )}
        </div>

        <div
          className="mermaid-dialog-preview-section"
          css={dialogPreviewSectionStyles}
        >
          <div className="mermaid-dialog-preview-label" css={dialogLabelStyles}>
            Preview
          </div>
          <div
            aria-label="Mermaid diagram preview"
            className="mermaid-dialog-preview"
            css={dialogPreviewStyles}
          >
            <div
              aria-live="polite"
              className="mermaid-dialog-preview-content"
              css={dialogPreviewContentStyles}
              dangerouslySetInnerHTML={
                preview.status === 'success'
                  ? { __html: preview.svg }
                  : undefined
              }
            >
              {preview.status === 'success' ? null : (
                <span css={error ? dialogErrorStyles : dialogHelpStyles}>
                  {preview.status === 'loading'
                    ? 'Rendering preview…'
                    : 'A valid Mermaid diagram preview will appear here.'}
                </span>
              )}
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            isDisabled={!canSave}
            onClick={() => void save()}
          >
            {isSaving ? 'Saving…' : request.source ? 'Save' : 'Insert'}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </ModalDialog>
  );
}

export function MermaidEditorProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const activeRequest = useRef<PendingRequest | null>(null);
  const [request, setRequest] = useState<PendingRequest | null>(null);

  const complete = useCallback((source: string | undefined) => {
    const current = activeRequest.current;
    if (!current) {
      return;
    }

    activeRequest.current = null;
    setRequest(null);
    current.resolve(source);
  }, []);

  const openMermaidEditor = useCallback<OpenMermaidEditor>((nextRequest) => {
    activeRequest.current?.resolve(undefined);

    return new Promise((resolve) => {
      const pendingRequest: PendingRequest = {
        ...nextRequest,
        id: nextId.current++,
        resolve,
      };
      activeRequest.current = pendingRequest;
      setRequest(pendingRequest);
    });
  }, []);

  useEffect(
    () => () => {
      activeRequest.current?.resolve(undefined);
      activeRequest.current = null;
    },
    [],
  );

  const value = useMemo(() => openMermaidEditor, [openMermaidEditor]);

  return (
    <MermaidEditorContext.Provider value={value}>
      {children}
      <ModalTransition>
        {request ? (
          <MermaidEditorDialog
            key={request.id}
            onCancel={() => complete(undefined)}
            onSave={complete}
            request={request}
          />
        ) : null}
      </ModalTransition>
    </MermaidEditorContext.Provider>
  );
}
