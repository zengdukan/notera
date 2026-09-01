import { useState } from 'react';
import Button from '@atlaskit/button/new';
import SearchIcon from '@atlaskit/icon/core/search';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Textfield from '@atlaskit/textfield';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';

import type { NoteraClient } from '../platform/notera-client';
import { SearchResults } from './SearchResults';
import { SearchScopePicker } from './SearchScopePicker';
import {
  uniqueSearchResults,
  useSearchResults,
  type SearchResult,
} from './search-queries';

const searchModalStyles = xcss({
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: 'space.200',
  height: 'min(68vh, 516px)',
  minHeight: '0',
});

const searchInputStyles = xcss({
  flexGrow: 1,
  minWidth: '0',
});

const resultsStyles = xcss({
  minHeight: '0',
  overflowY: 'auto',
  borderBlockStartColor: 'color.border',
  borderBlockStartStyle: 'solid',
  borderBlockStartWidth: 'border.width',
});

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
    <Box xcss={searchModalStyles}>
      <Box aria-label="Search notes" role="search">
        <Inline alignBlock="center" space="space.100">
          <Box xcss={searchInputStyles}>
            <Textfield
              autoFocus
              type="search"
              aria-label="Search notes"
              elemBeforeInput={<SearchIcon label="" />}
              placeholder="Search notes"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setOpenFailed(false);
              }}
            />
          </Box>
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
        </Inline>
      </Box>
      <Box as="section" aria-label="Search results" xcss={resultsStyles}>
        {openFailed ? (
          <Box paddingBlock="space.200">
            <SectionMessage
              appearance="error"
              title="This note is no longer available"
            >
              Refresh the results and try again.
            </SectionMessage>
          </Box>
        ) : null}
        {query.trim().length === 0 ? (
          <Box paddingBlock="space.200">
            <Text color="color.text.subtle">
              Enter text to search all notes.
            </Text>
          </Box>
        ) : null}
        {results.isPending && query.trim().length > 0 ? (
          <Box paddingBlock="space.300">
            <Inline alignBlock="center" alignInline="center" space="space.100">
              <Spinner label="Searching" />
              <Text color="color.text.subtle">Searching notes</Text>
            </Inline>
          </Box>
        ) : null}
        {results.isError ? (
          <Box paddingBlock="space.200">
            <SectionMessage appearance="error" title="Search failed">
              Check the search text and try again.
            </SectionMessage>
          </Box>
        ) : null}
        {results.isSuccess ? (
          <SearchResults
            results={items}
            onOpen={(result) => void open(result)}
          />
        ) : null}
      </Box>
      {results.hasNextPage ? (
        <Box paddingBlockStart="space.050">
          <Button
            shouldFitContainer
            isLoading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            Load more
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
