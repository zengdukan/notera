import { useState } from 'react';
import Button from '@atlaskit/button/new';
import SearchIcon from '@atlaskit/icon/core/search';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Textfield from '@atlaskit/textfield';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';
import { ModalBody } from '@atlaskit/modal-dialog';

import type { NoteraClient } from '../platform/notera-client';
import { SearchResults } from './SearchResults';
import { SearchScopePicker } from './SearchScopePicker';
import {
  uniqueSearchResults,
  useSearchResults,
  type SearchResult,
} from './search-queries';
import { useDebouncedValue } from './use-debounced-value';

const SEARCH_QUERY_DEBOUNCE_MS = 300;

const searchModalStyles = xcss({
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: 'space.200',
  height: 'min(68vh, 516px)',
  minHeight: '0',
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
  const debouncedQuery = useDebouncedValue(query, SEARCH_QUERY_DEBOUNCE_MS);
  const normalizedQuery = query.trim();
  const isDebouncing = normalizedQuery !== debouncedQuery.trim();
  const results = useSearchResults({
    client,
    profileId,
    query: debouncedQuery,
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
    <ModalBody>
      <Box paddingBlockEnd="space.300" xcss={searchModalStyles}>
        <Box aria-label="Search notes" role="search">
          <Inline alignBlock="center" space="space.100">
            <Textfield
              autoFocus
              type="search"
              aria-label="Search notes"
              elemBeforeInput={
                <Box paddingInlineStart="space.100">
                  <SearchIcon label="" />
                </Box>
              }
              placeholder="Search notes"
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
          {normalizedQuery.length === 0 ? (
            <Box paddingBlock="space.200">
              <Text color="color.text.subtle">
                Enter text to search all notes.
              </Text>
            </Box>
          ) : null}
          {normalizedQuery.length > 0 && (isDebouncing || results.isPending) ? (
            <Box paddingBlock="space.300">
              <Inline
                alignBlock="center"
                alignInline="center"
                space="space.100"
              >
                <Spinner label="Searching" />
                <Text color="color.text.subtle">Searching notes</Text>
              </Inline>
            </Box>
          ) : null}
          {!isDebouncing && results.isError ? (
            <Box paddingBlock="space.200">
              <SectionMessage appearance="error" title="Search failed">
                Check the search text and try again.
              </SectionMessage>
            </Box>
          ) : null}
          {!isDebouncing && results.isSuccess ? (
            <SearchResults
              results={items}
              onOpen={(result) => void open(result)}
            />
          ) : null}
        </Box>
        {!isDebouncing && results.hasNextPage ? (
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
    </ModalBody>
  );
}
