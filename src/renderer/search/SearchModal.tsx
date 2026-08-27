import { useState } from 'react';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Textfield from '@atlaskit/textfield';
import { Stack, Text } from '@atlaskit/primitives';

import type { NoteraClient } from '../platform/notera-client';
import { SearchResults } from './SearchResults';
import { SearchScopePicker } from './SearchScopePicker';
import {
  uniqueSearchResults,
  useSearchResults,
  type SearchResult,
} from './search-queries';

export function SearchModal({
  client,
  profileId,
  rootFolderId,
  onOpen,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly rootFolderId: string;
  readonly onOpen: (
    result: SearchResult,
  ) => Promise<boolean | void> | boolean | void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<{
    readonly id: string;
    readonly name: string;
  }>();
  const [openFailed, setOpenFailed] = useState(false);
  const results = useSearchResults({
    client,
    profileId,
    query,
    ...(scope === undefined ? {} : { folderId: scope.id }),
  });
  const items = uniqueSearchResults(results.data?.pages);
  const open = async (result: SearchResult) => {
    const opened = await onOpen(result);
    if (opened === false) {
      setOpenFailed(true);
      await results.refetch();
    }
  };
  return (
    <Stack space="space.200">
      <Textfield
        autoFocus
        type="search"
        aria-label="Search notes"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpenFailed(false);
        }}
      />
      <SearchScopePicker
        client={client}
        profileId={profileId}
        rootFolderId={rootFolderId}
        value={scope}
        onChange={(value) => {
          setScope(value);
          setOpenFailed(false);
        }}
      />
      {openFailed ? (
        <SectionMessage
          appearance="error"
          title="This note is no longer available"
        >
          Refresh the results and try again.
        </SectionMessage>
      ) : null}
      {query.trim().length === 0 ? (
        <Text>Enter text to search all notes.</Text>
      ) : null}
      {results.isPending && query.trim().length > 0 ? (
        <Spinner label="Searching" />
      ) : null}
      {results.isError ? (
        <SectionMessage appearance="error" title="Search failed">
          Check the search text and try again.
        </SectionMessage>
      ) : null}
      {results.isSuccess ? (
        <SearchResults results={items} onOpen={(result) => void open(result)} />
      ) : null}
      {results.hasNextPage ? (
        <Button
          appearance="subtle"
          isLoading={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}
