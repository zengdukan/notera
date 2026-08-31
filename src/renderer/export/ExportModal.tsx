import { useState, useSyncExternalStore } from 'react';
import Button from '@atlaskit/button/new';
import { RadioGroup } from '@atlaskit/radio';
import SectionMessage from '@atlaskit/section-message';
import { Stack } from '@atlaskit/primitives';

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
      <ExportProgress
        operation={operation}
        onCancel={() => void controller.cancel()}
      />
    );
  }
  if (operation) {
    return <ExportReport operation={operation} />;
  }
  if (saveFailed) {
    return (
      <div className="notera-export-setup">
        <Stack space="space.200">
          <SectionMessage
            appearance="warning"
            title="Latest changes could not be saved"
          >
            Export the last successfully saved version, or return to editing
            without exporting.
          </SectionMessage>
          <div className="notera-export-actions">
            <Button onClick={onReturnToEdit}>Return to editing</Button>
            <Button
              appearance="primary"
              isLoading={starting}
              onClick={() => void start('saved')}
            >
              Export last saved version
            </Button>
          </div>
        </Stack>
      </div>
    );
  }
  return (
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
        <div className="notera-export-actions">
          <Button
            appearance="primary"
            isLoading={starting}
            onClick={() => void start('try')}
          >
            Export
          </Button>
        </div>
      </Stack>
    </div>
  );
}
