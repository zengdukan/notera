import SectionMessage from '@atlaskit/section-message';
import { Text } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

import type { ExportOperation } from './export-operation';

export function ExportReport({
  operation,
}: {
  readonly operation: Exclude<ExportOperation, { state: 'RUNNING' }>;
}) {
  const intl = useIntl();
  if (operation.state === 'CANCELLED') {
    return (
      <SectionMessage
        title={intl.formatMessage({ id: 'export.result.cancelledTitle' })}
      >
        <Text>
          {intl.formatMessage({ id: 'export.result.cancelledDescription' })}
        </Text>
      </SectionMessage>
    );
  }
  if (operation.state === 'FAILED') {
    return (
      <SectionMessage
        appearance="error"
        title={intl.formatMessage({ id: 'export.result.failedTitle' })}
      >
        <Text>
          {intl.formatMessage({ id: 'export.result.failedDescription' })}
        </Text>
      </SectionMessage>
    );
  }
  if (operation.kind !== 'NOTE_EXPORT') return null;
  const { report } = operation.result;
  const format = intl.formatMessage({
    id:
      report.format === 'PDF'
        ? 'export.format.pdf'
        : 'export.format.markdown',
  });
  const packaging = intl.formatMessage({
    id:
      report.packaging === 'ZIP'
        ? 'export.packaging.zip'
        : 'export.packaging.direct',
  });
  return (
    <SectionMessage
      appearance="success"
      title={intl.formatMessage({ id: 'export.result.completedTitle' })}
    >
      <Text>
        {intl.formatMessage(
          { id: 'export.result.summary' },
          { format, packaging },
        )}
      </Text>
    </SectionMessage>
  );
}
