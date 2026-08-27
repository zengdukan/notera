import Flag, { FlagGroup } from '@atlaskit/flag';
import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';

import type { ExportOperation } from './export-operation';

export function ExportReport({ operation }: {
  readonly operation: Exclude<ExportOperation, { state: 'RUNNING' }>;
}) {
  if (operation.state === 'CANCELLED') return <Text>Export cancelled.</Text>;
  if (operation.state === 'FAILED') {
    return (
      <SectionMessage appearance="error" title="Export failed">
        No output location or internal error details are shown.
      </SectionMessage>
    );
  }
  if (operation.kind !== 'NOTE_EXPORT') return null;
  const { report } = operation.result;
  return (
    <Stack space="space.150">
      <FlagGroup label="Export notifications">
        <Flag id="export-complete" appearance="success" title="Export completed" />
      </FlagGroup>
      <Text>Format: {report.format === 'PDF' ? 'PDF' : 'Markdown'}</Text>
      <Text>Packaging: {report.packaging === 'ZIP' ? 'ZIP archive' : 'Single file'}</Text>
      {report.lossyNodeCount > 0 ? (
        <SectionMessage appearance="warning" title="Some content was simplified">
          {report.lossyNodeCount} unsupported nodes were exported with reduced fidelity.
        </SectionMessage>
      ) : null}
    </Stack>
  );
}
