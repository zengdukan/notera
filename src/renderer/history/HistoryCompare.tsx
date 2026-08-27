import { Inline, Stack, Text } from '@atlaskit/primitives';

import { RendererSurface } from '../editor/RendererSurface';
import type { RequestData } from '../platform/notera-client';

export function HistoryCompare({
  noteId,
  comparison,
}: {
  readonly noteId: string;
  readonly comparison: RequestData<'history.compare'>;
}) {
  return (
    <Inline space="space.300" alignBlock="start" shouldWrap={false}>
      <Stack space="space.100" grow="fill">
        <Text weight="semibold">Current saved version</Text>
        <Text>{comparison.left.title || 'Untitled'}</Text>
        <RendererSurface noteId={noteId} document={comparison.left.document} />
      </Stack>
      <Stack space="space.100" grow="fill">
        <Text weight="semibold">Selected history version</Text>
        <Text>{comparison.right.title || 'Untitled'}</Text>
        <RendererSurface noteId={noteId} document={comparison.right.document} />
      </Stack>
    </Inline>
  );
}
