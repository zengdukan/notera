import Button from '@atlaskit/button/new';
import ProgressBar from '@atlaskit/progress-bar';
import { Stack, Text } from '@atlaskit/primitives';

import type { ExportOperation } from './export-operation';

const labels = {
  PREPARING: 'Preparing',
  READING: 'Reading',
  ENCRYPTING: 'Preparing',
  RENDERING: 'Rendering',
  WRITING: 'Writing',
  FINALIZING: 'Completing',
} as const;

export function ExportProgress({ operation, onCancel }: {
  readonly operation: Extract<ExportOperation, { state: 'RUNNING' }>;
  readonly onCancel: () => void;
}) {
  return (
    <Stack space="space.150">
      <Text>{labels[operation.phase]}</Text>
      <ProgressBar
        ariaLabel="Export progress"
        isIndeterminate={operation.progress === null}
        value={operation.progress ?? 0}
      />
      <Button onClick={onCancel}>Cancel export</Button>
    </Stack>
  );
}
