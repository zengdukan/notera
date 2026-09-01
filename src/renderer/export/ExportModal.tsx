import { useState, useSyncExternalStore } from 'react';
import Button from '@atlaskit/button/new';
import { RadioGroup } from '@atlaskit/radio';
import SectionMessage from '@atlaskit/section-message';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Box, Stack } from '@atlaskit/primitives';

import type { ExportController, ExportFormat } from './export-controller';
import type { ExportOperationStore } from './export-operation';
import { ExportProgress } from './ExportProgress';
import { ExportReport } from './ExportReport';

export function ExportModal({
  noteId,
  controller,
  store,
  onReturnToEdit,
}: {
  readonly noteId: string;
  readonly controller: ExportController;
  readonly store: ExportOperationStore;
  readonly onReturnToEdit: () => void;
}) {
  const operation = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [format, setFormat] = useState<ExportFormat>('MARKDOWN');
  const [saveFailed, setSaveFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const start = async (save: 'try' | 'saved') => {
    setStarting(true);
    setFailed(false);
    try {
      const result = await controller.start({ noteId, format, save });
      setSaveFailed(result === 'save-failed');
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  };

  if (operation?.state === 'RUNNING') {
    return (
      <>
        <ModalBody>
          <ExportProgress operation={operation} />
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => void controller.cancel()}>
            Cancel export
          </Button>
        </ModalFooter>
      </>
    );
  }
  if (operation) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <ExportReport operation={operation} />
        </Box>
      </ModalBody>
    );
  }
  if (saveFailed) {
    return (
      <>
        <ModalBody>
          <div className="notera-export-setup">
            <Stack space="space.200">
              <SectionMessage
                appearance="warning"
                title="Latest changes could not be saved"
              >
                Export the last successfully saved version, or return to editing
                without exporting.
              </SectionMessage>
            </Stack>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onReturnToEdit}>Return to editing</Button>
          <Button
            appearance="primary"
            isLoading={starting}
            onClick={() => void start('saved')}
          >
            Export last saved version
          </Button>
        </ModalFooter>
      </>
    );
  }
  return (
    <>
      <ModalBody>
        <div className="notera-export-setup">
          <Stack space="space.200">
            <RadioGroup
              name="export-format"
              value={format}
              options={[
                { name: 'export-format', value: 'MARKDOWN', label: 'Markdown' },
                { name: 'export-format', value: 'PDF', label: 'PDF' },
              ]}
              onChange={(event) =>
                setFormat(event.currentTarget.value as ExportFormat)
              }
            />
            <SectionMessage
              appearance="warning"
              title="Export creates plaintext files"
            >
              Exported files are outside Notera encryption and must be protected
              separately.
            </SectionMessage>
            {failed ? (
              <SectionMessage appearance="error" title="Export could not start">
                Try again without exposing any output path.
              </SectionMessage>
            ) : null}
          </Stack>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          appearance="primary"
          isLoading={starting}
          onClick={() => void start('try')}
        >
          Export
        </Button>
      </ModalFooter>
    </>
  );
}
