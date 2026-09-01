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

const stages = [
  'Preparing',
  'Reading',
  'Rendering',
  'Writing',
  'Completing',
] as const;

const stageForPhase = {
  PREPARING: 0,
  ENCRYPTING: 0,
  READING: 1,
  RENDERING: 2,
  WRITING: 3,
  FINALIZING: 4,
} as const;

export function ExportProgress({
  operation,
}: {
  readonly operation: Extract<ExportOperation, { state: 'RUNNING' }>;
}) {
  const currentStage = stageForPhase[operation.phase];
  return (
    <section aria-label="Export progress" className="notera-export-progress">
      <Stack space="space.150">
        <Text weight="semibold">{labels[operation.phase]}</Text>
        <ProgressBar
          ariaLabel="Export progress"
          isIndeterminate={operation.progress === null}
          value={operation.progress ?? 0}
        />
        <ol aria-label="Export stages" className="notera-export-stages">
          {stages.map((stage, index) => (
            <li
              aria-current={index === currentStage ? 'step' : undefined}
              aria-label={stage}
              className={
                index <= currentStage ? 'notera-export-stages__active' : ''
              }
              key={stage}
            >
              <span>{stage}</span>
              {index < stages.length - 1 ? (
                <span aria-hidden="true"> → </span>
              ) : null}
            </li>
          ))}
        </ol>
      </Stack>
    </section>
  );
}
