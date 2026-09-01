import { useState } from 'react';
import Button from '@atlaskit/button/new';
import FolderClosedIcon from '@atlaskit/icon/core/folder-closed';
import SearchIcon from '@atlaskit/icon/core/search';
import Popup from '@atlaskit/popup';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { useQuery } from '@tanstack/react-query';

import { FolderPicker } from '../notes/FolderPicker';
import { loadFolderPickerItems } from '../notes/folder-picker-data';
import type { NoteraClient } from '../platform/notera-client';

const popupStyles = xcss({
  boxSizing: 'border-box',
  minWidth: '280px',
});

interface Scope {
  readonly id: string;
  readonly name: string;
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
  const folders = useQuery({
    queryKey: ['search-folder-picker', profileId, rootFolderId],
    enabled: open,
    queryFn: () => loadFolderPickerItems(client, rootFolderId),
  });
  const choose = (scope?: Scope) => {
    onChange(scope);
    setOpen(false);
  };
  return (
    <Popup
      isOpen={open}
      onClose={() => setOpen(false)}
      placement="bottom-start"
      shouldRenderToParent
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          iconBefore={FolderClosedIcon}
          onClick={() => setOpen((current) => !current)}
          aria-label={`Search scope: ${value?.name ?? 'All notes'}`}
        >
          {value?.name ?? 'All notes'}
        </Button>
      )}
      content={() => (
        <Box
          padding="space.100"
          testId="search-scope-popup"
          xcss={popupStyles}
        >
          <Stack space="space.100">
            <Button
              appearance="subtle"
              iconBefore={SearchIcon}
              isSelected={value === undefined}
              shouldFitContainer
              onClick={() => choose(undefined)}
              aria-label="Choose All notes"
            >
              All notes
            </Button>
            {folders.isPending ? (
              <Inline
                alignBlock="center"
                alignInline="center"
                space="space.100"
              >
                <Spinner label="Loading folders" size="small" />
                <Text color="color.text.subtle" size="small">
                  Loading folders
                </Text>
              </Inline>
            ) : null}
            {folders.isError ? (
              <SectionMessage appearance="error" title="Folders unavailable">
                Try opening the folder picker again.
              </SectionMessage>
            ) : null}
            {folders.data ? (
              <FolderPicker
                rootFolderId={rootFolderId}
                folders={folders.data}
                disabledIds={new Set()}
                value={value?.id ?? ''}
                onChange={(folderId) => {
                  const folder = folders.data.find(
                    (item) => item.id === folderId,
                  );
                  choose({
                    id: folderId,
                    name:
                      folderId === rootFolderId
                        ? 'Root'
                        : (folder?.name ?? 'Root'),
                  });
                }}
              />
            ) : null}
          </Stack>
        </Box>
      )}
    />
  );
}
