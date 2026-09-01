import EmptyState from '@atlaskit/empty-state';
import NoteIcon from '@atlaskit/icon/core/note';
import { ButtonItem, MenuGroup, Section } from '@atlaskit/menu';
import { Box, Stack, Text } from '@atlaskit/primitives';

import { Divider } from '@atlaskit/side-nav-items/menu-section';
import type { SearchResult } from './search-queries';
import { searchSnippet } from './search-snippet';
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
      <Box paddingBlock="space.200">
        <EmptyState
          header="No matching notes"
          description="Try another search or folder."
          headingLevel={2}
          headingSize="xsmall"
          width="narrow"
        />
      </Box>
    );
  }
  return (
    <MenuGroup menuLabel="Matching notes" role="list">
      <Section isList>
        {results.map((result) => {
          const excerpt = searchSnippet(
            result.excerpt,
            rangesFor(result, 'excerpt'),
          );
          return (
            <>
              <ButtonItem
                description={
                  <Stack space="space.025">
                    <Text color="color.text.subtle" maxLines={1} size="small">
                      {result.folderPath
                        .map((item) => item.name || 'Root')
                        .join(' / ')}
                    </Text>
                    <Text maxLines={2} size="small">
                      {excerpt.hasLeadingEllipsis ? '…' : null}
                      <HighlightedText
                        text={excerpt.text}
                        ranges={excerpt.ranges}
                      />
                      {excerpt.hasTrailingEllipsis ? '…' : null}
                    </Text>
                  </Stack>
                }
                iconBefore={<NoteIcon label="" />}
                key={result.noteId}
                onClick={() => onOpen(result)}
                shouldDescriptionWrap
              >
                <Text weight="semibold">
                  <HighlightedText
                    text={result.title || 'Untitled'}
                    ranges={rangesFor(result, 'title')}
                  />
                </Text>
              </ButtonItem>
              <Divider />
            </>
          );
        })}
      </Section>
    </MenuGroup>
  );
}
