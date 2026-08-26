/** @jsxImportSource @emotion/react */
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
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

import { renderKatex, validateLatex } from './katex';
import { MathEditorContext } from './math-editor-context';
import {
  dialogBlockPreviewStyles,
  dialogErrorStyles,
  dialogFieldStyles,
  dialogHelpStyles,
  dialogInlinePreviewStyles,
  dialogLabelStyles,
  dialogPreviewContentStyles,
  dialogPreviewSectionStyles,
  dialogPreviewStyles,
} from './styles';
import type { MathEditorRequest, OpenMathEditor } from './types';

type PendingRequest = MathEditorRequest & {
  id: number;
  resolve: (latex: string | undefined) => void;
};

function MathEditorDialog({
  request,
  onCancel,
  onSave,
}: {
  request: MathEditorRequest;
  onCancel: () => void;
  onSave: (latex: string) => void;
}) {
  const intl = useIntl();
  const [latex, setLatex] = useState(request.latex);
  const error = validateLatex(latex, request.kind);
  const preview = error ? null : renderKatex(latex, request.kind, true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const title = intl.formatMessage({
    id: `math.editor.${request.kind}.title`,
    defaultMessage:
      request.kind === 'inline' ? 'Inline equation' : 'Block equation',
  });

  const save = useCallback(() => {
    if (!error) {
      onSave(latex);
    }
  }, [error, latex, onSave]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <ModalDialog
      autoFocus={inputRef}
      onClose={onCancel}
      shouldCloseOnOverlayClick={false}
      testId="math-editor-dialog"
      width="medium"
    >
      <ModalHeader hasCloseButton>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="math-dialog-field" css={dialogFieldStyles}>
          <label
            className="math-dialog-label"
            css={dialogLabelStyles}
            htmlFor="math-latex-input"
          >
            LaTeX
          </label>
          <TextArea
            aria-describedby={error ? 'math-latex-error' : 'math-latex-help'}
            id="math-latex-input"
            isInvalid={Boolean(error)}
            isMonospaced
            maxHeight="240px"
            minimumRows={request.kind === 'block' ? 6 : 3}
            onChange={(event) => setLatex(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              request.kind === 'inline' ? 'E = mc^2' : '\\int_a^b f(x)\\,dx'
            }
            ref={inputRef}
            resize="smart"
            spellCheck={false}
            testId="math-latex-input"
            value={latex}
          />
          {error ? (
            <div
              className="math-dialog-error"
              css={dialogErrorStyles}
              id="math-latex-error"
              role="alert"
            >
              {error}
            </div>
          ) : (
            <div
              className="math-dialog-help"
              css={dialogHelpStyles}
              id="math-latex-help"
            >
              Press Ctrl+Enter or Command+Enter to save.
            </div>
          )}
        </div>

        <div
          className="math-dialog-preview-section"
          css={dialogPreviewSectionStyles}
        >
          <div className="math-dialog-preview-label" css={dialogLabelStyles}>
            Preview
          </div>
          <div
            aria-label="Equation preview"
            className="math-dialog-preview"
            css={dialogPreviewStyles}
          >
            {preview && !preview.error ? (
              <span
                className={`math-dialog-preview-content math-dialog-preview-content--${request.kind}`}
                css={[
                  dialogPreviewContentStyles,
                  request.kind === 'inline'
                    ? dialogInlinePreviewStyles
                    : dialogBlockPreviewStyles,
                ]}
                dangerouslySetInnerHTML={{ __html: preview.html }}
                role="math"
              />
            ) : (
              <span
                className="math-dialog-preview-placeholder"
                css={dialogHelpStyles}
              >
                A valid equation preview will appear here.
              </span>
            )}
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
            isDisabled={Boolean(error)}
            onClick={save}
          >
            {request.latex ? 'Save' : 'Insert'}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </ModalDialog>
  );
}

export function MathEditorProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const activeRequest = useRef<PendingRequest | null>(null);
  const [request, setRequest] = useState<PendingRequest | null>(null);

  const complete = useCallback((latex: string | undefined) => {
    const current = activeRequest.current;
    if (!current) {
      return;
    }

    activeRequest.current = null;
    setRequest(null);
    current.resolve(latex);
  }, []);

  const openMathEditor = useCallback<OpenMathEditor>((nextRequest) => {
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

  const value = useMemo(() => openMathEditor, [openMathEditor]);

  return (
    <MathEditorContext.Provider value={value}>
      {children}
      <ModalTransition>
        {request ? (
          <MathEditorDialog
            key={request.id}
            onCancel={() => complete(undefined)}
            onSave={complete}
            request={request}
          />
        ) : null}
      </ModalTransition>
    </MathEditorContext.Provider>
  );
}
