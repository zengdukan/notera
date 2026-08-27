import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Popup from '@atlaskit/popup';
import { Inline, Stack } from '@atlaskit/primitives';

import type { NoteraClient } from '../platform/notera-client';
import { useTreeChildren } from '../navigation/tree-queries';

interface Scope {
  readonly id: string;
  readonly name: string;
}

function FolderLevel({
  client,
  profileId,
  parentFolderId,
  onChoose,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly parentFolderId: string;
  readonly onChoose: (scope: Scope) => void;
}) {
  const query = useTreeChildren({ client, profileId, parentFolderId });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const folders = (
    query.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((entry) => entry.kind === 'folder');
  return (
    <Stack space="space.050">
      {folders.map((folder) => (
        <Stack key={folder.id} space="space.050">
          <Inline space="space.050" alignBlock="center">
            {folder.hasChildren ? (
              <Button
                appearance="subtle"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })
                }
                aria-label={`${expanded.has(folder.id) ? 'Collapse' : 'Expand'} ${folder.name}`}
              >
                {expanded.has(folder.id) ? '−' : '+'}
              </Button>
            ) : null}
            <Button
              appearance="subtle"
              onClick={() => onChoose({ id: folder.id, name: folder.name })}
              aria-label={`Choose ${folder.name}`}
            >
              {folder.name}
            </Button>
          </Inline>
          {expanded.has(folder.id) ? (
            <FolderLevel
              client={client}
              profileId={profileId}
              parentFolderId={folder.id}
              onChoose={onChoose}
            />
          ) : null}
        </Stack>
      ))}
      {query.hasNextPage ? (
        <Button appearance="subtle" onClick={() => void query.fetchNextPage()}>
          Load more folders
        </Button>
      ) : null}
    </Stack>
  );
}

export function SearchScopePicker({
  client,
  profileId,
  rootFolderId,
  value,
  onChange,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly rootFolderId: string;
  readonly value?: Scope;
  readonly onChange: (value?: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (scope?: Scope) => {
    onChange(scope);
    setOpen(false);
  };
  return (
    <Popup
      isOpen={open}
      onClose={() => setOpen(false)}
      placement="bottom-start"
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          onClick={() => setOpen((current) => !current)}
          aria-label={`Search scope: ${value?.name ?? 'All notes'}`}
        >
          {value?.name ?? 'All notes'}
        </Button>
      )}
      content={() => (
        <Stack space="space.100">
          <Button
            appearance="subtle"
            onClick={() => choose(undefined)}
            aria-label="Choose All notes"
          >
            All notes
          </Button>
          <Button
            appearance="subtle"
            onClick={() => choose({ id: rootFolderId, name: 'Root' })}
            aria-label="Choose Root"
          >
            Root
          </Button>
          <FolderLevel
            client={client}
            profileId={profileId}
            parentFolderId={rootFolderId}
            onChoose={choose}
          />
        </Stack>
      )}
    />
  );
}
