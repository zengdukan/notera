import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { Stack } from '@atlaskit/primitives';

import type { NoteraClient } from '../platform/notera-client';
import {
  uniqueRecentNotes,
  useRecentNotes,
  type RecentNote,
} from './recent-queries';

export function RecentModal({
  client,
  profileId,
  onOpen,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly onOpen: (
    note: RecentNote,
  ) => Promise<boolean | void> | boolean | void;
}) {
  const recent = useRecentNotes({ client, profileId });
  const items = uniqueRecentNotes(recent.data?.pages);
  if (recent.isPending) return <Spinner label="Loading recent notes" />;
  if (recent.isError) {
    return (
      <SectionMessage appearance="error" title="Could not load recent notes">
        Close this dialog and try again.
      </SectionMessage>
    );
  }
  if (items.length === 0)
    return (
      <EmptyState
        header="No recent notes"
        description="Notes you open will appear here."
      />
    );
  return (
    <Stack space="space.100">
      {items.map((note) => (
        <Button
          key={note.id}
          appearance="subtle"
          shouldFitContainer
          onClick={() => void onOpen(note)}
          aria-label={`Open ${note.title || 'Untitled'}`}
        >
          {note.title || 'Untitled'}
        </Button>
      ))}
      {recent.hasNextPage ? (
        <Button
          appearance="subtle"
          isLoading={recent.isFetchingNextPage}
          onClick={() => void recent.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}
