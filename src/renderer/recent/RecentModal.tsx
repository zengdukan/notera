import { Fragment, useState } from 'react';
import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import NoteIcon from '@atlaskit/icon/core/note';
import { ButtonItem, MenuGroup, Section, SkeletonItem } from '@atlaskit/menu';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { ModalBody } from '@atlaskit/modal-dialog';
import VisuallyHidden from '@atlaskit/visually-hidden';
import { useIntl } from 'react-intl';

import { Divider } from '@atlaskit/side-nav-items/menu-section';
import type { NoteraClient } from '../platform/notera-client';
import { formatRecentTimestamp } from './recent-format';
import {
  uniqueRecentNotes,
  useRecentNotes,
  type RecentNote,
} from './recent-queries';

function RecentLoadingState() {
  const intl = useIntl();
  const listLabel = intl.formatMessage({ id: 'recent.listLabel' });
  return (
    <Stack space="space.200">
      <VisuallyHidden id="recent-list-label">{listLabel}</VisuallyHidden>
      <MenuGroup isLoading menuLabel={listLabel}>
        <Section isList titleId="recent-list-label">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonItem
              hasIcon
              isShimmering
              key={index}
              testId="recent-note-skeleton"
            />
          ))}
        </Section>
      </MenuGroup>
      <Inline alignBlock="center" alignInline="center" space="space.100">
        <Spinner
          label={intl.formatMessage({ id: 'recent.loadingLabel' })}
          size="medium"
        />
        <Text color="color.text.subtle" size="small">
          {intl.formatMessage({ id: 'recent.loadingDescription' })}
        </Text>
      </Inline>
    </Stack>
  );
}

function RecentEmptyState({ onClose }: { readonly onClose: () => void }) {
  const intl = useIntl();
  return (
    <EmptyState
      buttonGroupLabel={intl.formatMessage({ id: 'recent.emptyActionsLabel' })}
      description={intl.formatMessage({ id: 'recent.emptyDescription' })}
      header={intl.formatMessage({ id: 'recent.emptyTitle' })}
      headingLevel={2}
      headingSize="xsmall"
      primaryAction={
        <Button appearance="primary" onClick={onClose}>
          {intl.formatMessage({ id: 'recent.returnToContent' })}
        </Button>
      }
      width="narrow"
    />
  );
}

function RecentErrorState({ onRetry }: { readonly onRetry: () => void }) {
  const intl = useIntl();
  return (
    <Stack space="space.300">
      <SectionMessage
        appearance="error"
        headingLevel="h2"
        title={intl.formatMessage({ id: 'recent.loadErrorTitle' })}
      >
        <Text as="p">
          {intl.formatMessage({ id: 'recent.loadErrorDescription' })}
        </Text>
        <Button appearance="danger" onClick={onRetry} spacing="compact">
          {intl.formatMessage({ id: 'recent.retry' })}
        </Button>
      </SectionMessage>
      <Text as="p" color="color.text.subtle" size="small">
        {intl.formatMessage({ id: 'recent.errorDisclosure' })}
      </Text>
    </Stack>
  );
}

export function RecentModal({
  client,
  profileId,
  onOpen,
  onClose,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly onOpen: (
    note: RecentNote,
  ) => Promise<boolean | void> | boolean | void;
  readonly onClose: () => void;
}) {
  const intl = useIntl();
  const listLabel = intl.formatMessage({ id: 'recent.listLabel' });
  const recent = useRecentNotes({ client, profileId });
  const items = uniqueRecentNotes(recent.data?.pages);
  const [openingId, setOpeningId] = useState<string>();

  if (recent.isPending) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <RecentLoadingState />
        </Box>
      </ModalBody>
    );
  }
  if (recent.isError) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <RecentErrorState onRetry={() => void recent.refetch()} />
        </Box>
      </ModalBody>
    );
  }
  if (items.length === 0) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <RecentEmptyState onClose={onClose} />
        </Box>
      </ModalBody>
    );
  }

  const open = async (note: RecentNote) => {
    setOpeningId(note.id);
    try {
      await onOpen(note);
    } finally {
      setOpeningId(undefined);
    }
  };

  return (
    <ModalBody>
      <Box paddingBlockEnd="space.300">
        <Stack space="space.200">
          <Text as="p" color="color.text.subtle" size="small">
            {intl.formatMessage({ id: 'recent.sortDescription' })}
          </Text>
          <VisuallyHidden id="recent-list-label">{listLabel}</VisuallyHidden>
          <MenuGroup menuLabel={listLabel}>
            <Section isList titleId="recent-list-label">
              {items.map((note) => {
                const title =
                  note.title || intl.formatMessage({ id: 'recent.untitled' });
                return (
                  <Fragment key={note.id}>
                    <ButtonItem
                      description={`${note.folderPath.map((item) => item.name).join(' / ')} · ${formatRecentTimestamp(note.updatedAt)}`}
                      iconBefore={<NoteIcon label="" />}
                      isDisabled={openingId !== undefined}
                      onClick={() => void open(note)}
                      role="menuitem"
                    >
                      {title}
                    </ButtonItem>
                    <Divider />
                  </Fragment>
                );
              })}
            </Section>
          </MenuGroup>
          {recent.hasNextPage ? (
            <Inline alignInline="center">
              <Button
                isLoading={recent.isFetchingNextPage}
                onClick={() => void recent.fetchNextPage()}
              >
                {intl.formatMessage({ id: 'recent.loadMore' })}
              </Button>
            </Inline>
          ) : null}
        </Stack>
      </Box>
    </ModalBody>
  );
}
