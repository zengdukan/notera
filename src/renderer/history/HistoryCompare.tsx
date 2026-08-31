import { Stack, Text } from '@atlaskit/primitives';

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
    <section
      aria-label="Version comparison"
      className="notera-history-compare"
    >
      <article aria-label="Current saved version">
        <Stack space="space.100">
          <Text weight="semibold">Current saved version</Text>
          <Text>{comparison.left.title || 'Untitled'}</Text>
          <RendererSurface
            noteId={noteId}
            document={comparison.left.document}
          />
        </Stack>
      </article>
      <article aria-label="Selected history version">
        <Stack space="space.100">
          <Text weight="semibold">Selected history version</Text>
          <Text>{comparison.right.title || 'Untitled'}</Text>
          <RendererSurface
            noteId={noteId}
            document={comparison.right.document}
          />
        </Stack>
      </article>
    </section>
  );
}
