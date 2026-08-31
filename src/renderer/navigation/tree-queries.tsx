import { useInfiniteQuery } from '@tanstack/react-query';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';

import { treeKey } from '../app/query-keys';
import type { NoteraClient } from '../platform/notera-client';
import type { ContentEntry } from './content-controller';
import type { ContentAction } from './content-actions';
import { ContentTreeRow } from './ContentTreeRow';

export function useTreeChildren(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly parentFolderId: string;
  readonly enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: treeKey(input.profileId, input.parentFolderId),
    enabled: input.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      input.client.request('contentTree.listChildren', {
        parentFolderId: input.parentFolderId,
        limit: 50,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

function QueryLevel({
  client,
  profileId,
  parentFolderId,
  expandedIds,
  selected,
  onOpen,
  onToggle,
  onCreateNote,
  onCreateFolder,
  getActions,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly parentFolderId: string;
  readonly expandedIds: ReadonlySet<string>;
  readonly selected?: { readonly kind: 'folder' | 'note'; readonly id: string };
  readonly onOpen: (entry: ContentEntry) => void;
  readonly onToggle: (folderId: string, expanded: boolean) => void;
  readonly onCreateNote: (
    entry: Extract<ContentEntry, { kind: 'folder' }>,
  ) => void;
  readonly onCreateFolder: (
    entry: Extract<ContentEntry, { kind: 'folder' }>,
  ) => void;
  readonly getActions: (entry: ContentEntry) => readonly ContentAction[];
}) {
  const query = useTreeChildren({ client, profileId, parentFolderId });
  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {entries.map((entry) => {
        const expanded = entry.kind === 'folder' && expandedIds.has(entry.id);
        return (
          <ContentTreeRow
            key={`${entry.kind}:${entry.id}`}
            entry={entry}
            expanded={expanded}
            selected={selected?.kind === entry.kind && selected.id === entry.id}
            onOpen={() => onOpen(entry)}
            onToggle={(next) => {
              if (entry.kind === 'folder') onToggle(entry.id, next);
            }}
            onCreateNote={() => {
              if (entry.kind === 'folder') onCreateNote(entry);
            }}
            onCreateFolder={() => {
              if (entry.kind === 'folder') onCreateFolder(entry);
            }}
            actions={getActions(entry)}
          >
            {entry.kind === 'folder' ? (
              <QueryLevel
                client={client}
                profileId={profileId}
                parentFolderId={entry.id}
                expandedIds={expandedIds}
                selected={selected}
                onOpen={onOpen}
                onToggle={onToggle}
                onCreateNote={onCreateNote}
                onCreateFolder={onCreateFolder}
                getActions={getActions}
              />
            ) : null}
          </ContentTreeRow>
        );
      })}
      {query.hasNextPage ? (
        <ButtonMenuItem onClick={() => void query.fetchNextPage()}>
          Load more
        </ButtonMenuItem>
      ) : null}
    </>
  );
}

export function QueryContentTree(
  props: Omit<Parameters<typeof QueryLevel>[0], 'parentFolderId'> & {
    readonly rootFolderId: string;
  },
) {
  const { rootFolderId, ...queryProps } = props;
  return (
    <MenuList>
      <QueryLevel {...queryProps} parentFolderId={rootFolderId} />
    </MenuList>
  );
}
