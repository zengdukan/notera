import Spinner from '@atlaskit/spinner';
import { Stack, Text } from '@atlaskit/primitives';

import { RendererSurface } from '../editor/RendererSurface';
import type { HistorySnapshot } from './history-queries';

export function HistoryPreview({
  noteId,
  snapshot,
  loading,
}: {
  readonly noteId: string;
  readonly snapshot?: HistorySnapshot;
  readonly loading: boolean;
}) {
  if (loading) return <Spinner label="Loading version" />;
  if (!snapshot) return <Text>Select a version to preview it.</Text>;
  return (
    <Stack space="space.150">
      <Text weight="semibold">{snapshot.title || 'Untitled'}</Text>
      <RendererSurface noteId={noteId} document={snapshot.document} />
    </Stack>
  );
}
