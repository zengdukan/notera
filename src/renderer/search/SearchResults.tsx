import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import { Stack, Text } from '@atlaskit/primitives';

import type { SearchResult } from './search-queries';
import { HighlightedText } from './unicode-highlight';

function rangesFor(result: SearchResult, field: 'title' | 'excerpt') {
  return result.highlights
    .filter((range) => range.field === field)
    .map(({ start, end }) => ({ start, end }));
}

export function SearchResults({
  results,
  onOpen,
}: {
  readonly results: readonly SearchResult[];
  readonly onOpen: (result: SearchResult) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="notera-search-modal__state">
        <EmptyState
          header="No matching notes"
          description="Try another search or folder."
        />
      </div>
    );
  }
  return (
    <ul className="notera-search-results">
      {results.map((result) => (
        <li
          aria-label={result.title || 'Untitled'}
          className="notera-search-results__item"
          key={result.noteId}
        >
          <Stack space="space.050">
            <div className="notera-search-results__title">
              <Button
                appearance="subtle"
                shouldFitContainer
                onClick={() => onOpen(result)}
                aria-label={`Open ${result.title || 'Untitled'}`}
              >
                <HighlightedText
                  text={result.title || 'Untitled'}
                  ranges={rangesFor(result, 'title')}
                />
              </Button>
            </div>
            <Text color="color.text.subtle" size="small">
              {result.folderPath.map((item) => item.name || 'Root').join(' / ')}
            </Text>
            <Text>
              <HighlightedText
                text={result.excerpt}
                ranges={rangesFor(result, 'excerpt')}
              />
            </Text>
          </Stack>
        </li>
      ))}
    </ul>
  );
}
