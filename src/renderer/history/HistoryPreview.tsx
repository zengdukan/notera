import Spinner from '@atlaskit/spinner';
import { Stack, Text } from '@atlaskit/primitives';

import { RendererSurface } from '../editor/RendererSurface';
import type { HistorySnapshot } from './history-queries';

export function HistoryPreview({
  snapshot,
  loading,
}: {
  readonly snapshot?: HistorySnapshot;
  readonly loading: boolean;
}) {
  if (loading) return <Spinner label="Loading version" />;
  if (!snapshot) return <Text>Select a version to preview it.</Text>;
  return (
    <Stack space="space.150">
      <Text weight="semibold">{snapshot.title || 'Untitled'}</Text>
      <RendererSurface document={snapshot.document} />
    </Stack>
  );
}
