import { useState } from 'react';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Textfield from '@atlaskit/textfield';
import { Text } from '@atlaskit/primitives';

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
    <div className="notera-search-modal">
      <div
        aria-label="Search notes"
        className="notera-search-modal__controls"
        role="search"
      >
        <Textfield
          autoFocus
          type="search"
          aria-label="Search notes"
          placeholder="Search notes"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpenFailed(false);
          }}
        />
        <div className="notera-search-modal__scope">
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
        </div>
      </div>
      <section
        aria-label="Search results"
        className="notera-search-modal__results"
      >
        {openFailed ? (
          <div className="notera-search-modal__state">
            <SectionMessage
              appearance="error"
              title="This note is no longer available"
            >
              Refresh the results and try again.
            </SectionMessage>
          </div>
        ) : null}
        {query.trim().length === 0 ? (
          <div className="notera-search-modal__state">
            <Text color="color.text.subtle">
              Enter text to search all notes.
            </Text>
          </div>
        ) : null}
        {results.isPending && query.trim().length > 0 ? (
          <div className="notera-search-modal__state">
            <Spinner label="Searching" />
          </div>
        ) : null}
        {results.isError ? (
          <div className="notera-search-modal__state">
            <SectionMessage appearance="error" title="Search failed">
              Check the search text and try again.
            </SectionMessage>
          </div>
        ) : null}
        {results.isSuccess ? (
          <SearchResults
            results={items}
            onOpen={(result) => void open(result)}
          />
        ) : null}
      </section>
      {results.hasNextPage ? (
        <div className="notera-search-modal__more">
          <Button
            appearance="subtle"
            shouldFitContainer
            isLoading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
