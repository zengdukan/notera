import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';

import type { ExportOperation } from './export-operation';

export function ExportReport({
  operation,
}: {
  readonly operation: Exclude<ExportOperation, { state: 'RUNNING' }>;
}) {
  if (operation.state === 'CANCELLED') {
    return (
      <section aria-label="Export result" className="notera-export-report">
        <Text>Export cancelled.</Text>
      </section>
    );
  }
  if (operation.state === 'FAILED') {
    return (
      <section aria-label="Export result" className="notera-export-report">
        <SectionMessage appearance="error" title="Export failed">
          No output location or internal error details are shown.
        </SectionMessage>
      </section>
    );
  }
  if (operation.kind !== 'NOTE_EXPORT') return null;
  const { report } = operation.result;
  return (
    <section aria-label="Export result" className="notera-export-report">
      <Stack space="space.150">
        <SectionMessage
          appearance="success"
          title="Export completed"
        >
          {report.format === 'PDF' ? 'PDF' : 'Markdown'} ·{' '}
          {report.packaging === 'ZIP' ? 'ZIP archive' : 'Single file'}
        </SectionMessage>
        {report.lossyNodeCount > 0 ? (
          <SectionMessage
            appearance="warning"
            title="Some content was simplified"
          >
            {report.lossyNodeCount} unsupported nodes were exported with
            reduced fidelity.
          </SectionMessage>
        ) : null}
      </Stack>
    </section>
  );
}
