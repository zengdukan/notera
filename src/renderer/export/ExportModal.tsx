import { useState, useSyncExternalStore } from 'react';
import Button from '@atlaskit/button/new';
import DownloadIcon from '@atlaskit/icon/core/download';
import { RadioGroup } from '@atlaskit/radio';
import SectionMessage from '@atlaskit/section-message';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Box, Stack, Text } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { useIntl } from 'react-intl';

import type { ExportController, ExportFormat } from './export-controller';
import type { ExportOperationStore } from './export-operation';
import { ExportReport } from './ExportReport';

export function ExportModal({
  noteId,
  controller,
  store,
  onClose,
}: {
  readonly noteId: string;
  readonly controller: ExportController;
  readonly store: ExportOperationStore;
  readonly onClose: () => void;
}) {
  const intl = useIntl();
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
          <Box paddingBlock="space.600">
            <Stack alignInline="center">
              <Spinner
                label={intl.formatMessage({ id: 'export.runningLabel' })}
                size="large"
              />
            </Stack>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => void controller.cancel()}>
            {intl.formatMessage({ id: 'export.cancel' })}
          </Button>
        </ModalFooter>
      </>
    );
  }
  if (operation) {
    return (
      <>
        <ModalBody>
          <ExportReport operation={operation} />
        </ModalBody>
        <ModalFooter>
          <Button appearance="primary" onClick={onClose}>
            {intl.formatMessage({ id: 'export.close' })}
          </Button>
        </ModalFooter>
      </>
    );
  }
  if (saveFailed) {
    return (
      <>
        <ModalBody>
          <SectionMessage
            appearance="warning"
            headingLevel="h2"
            title={intl.formatMessage({ id: 'export.saveFailed.title' })}
          >
            {intl.formatMessage({ id: 'export.saveFailed.description' })}
          </SectionMessage>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>
            {intl.formatMessage({ id: 'export.returnToEdit' })}
          </Button>
          <Button
            appearance="primary"
            isLoading={starting}
            onClick={() => void start('saved')}
          >
            {intl.formatMessage({ id: 'export.exportSaved' })}
          </Button>
        </ModalFooter>
      </>
    );
  }
  return (
    <>
      <ModalBody>
        <Stack space="space.200">
          <Text id="export-format-label" weight="semibold">
            {intl.formatMessage({ id: 'export.format.label' })}
          </Text>
          <RadioGroup
            isDisabled={starting}
            labelId="export-format-label"
            name="export-format"
            value={format}
            options={[
              {
                name: 'export-format',
                value: 'MARKDOWN',
                label: 'Markdown',
              },
              {
                name: 'export-format',
                value: 'PDF',
                label: 'PDF',
              },
            ]}
            onChange={(event) =>
              setFormat(event.currentTarget.value as ExportFormat)
            }
          />
          <SectionMessage
            appearance="warning"
            headingLevel="h2"
            title={intl.formatMessage({ id: 'export.plaintext.title' })}
          >
            {intl.formatMessage({ id: 'export.plaintext.description' })}
          </SectionMessage>
          {failed ? (
            <SectionMessage
              appearance="error"
              headingLevel="h2"
              title={intl.formatMessage({ id: 'export.startFailed.title' })}
            >
              {intl.formatMessage({ id: 'export.startFailed.description' })}
            </SectionMessage>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          appearance="primary"
          iconBefore={DownloadIcon}
          isLoading={starting}
          onClick={() => void start('try')}
        >
          {intl.formatMessage({ id: 'export.action' })}
        </Button>
      </ModalFooter>
    </>
  );
}
