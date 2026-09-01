import { Fragment, useState } from 'react';
import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import NoteIcon from '@atlaskit/icon/core/note';
import { ButtonItem, MenuGroup, Section, SkeletonItem } from '@atlaskit/menu';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { ModalBody } from '@atlaskit/modal-dialog';

import { Divider } from '@atlaskit/side-nav-items/menu-section';
import type { NoteraClient } from '../platform/notera-client';
import { formatRecentTimestamp } from './recent-format';
import {
  uniqueRecentNotes,
  useRecentNotes,
  type RecentNote,
} from './recent-queries';

function RecentLoadingState() {
  return (
    <Stack space="space.200">
      <MenuGroup isLoading menuLabel="最近浏览笔记" role="list">
        <Section isList>
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
        <Spinner label="正在加载最近浏览" size="medium" />
        <Text color="color.text.subtle" size="small">
          正在加载最近浏览...
        </Text>
      </Inline>
    </Stack>
  );
}

function RecentEmptyState({ onClose }: { readonly onClose: () => void }) {
  return (
    <EmptyState
      buttonGroupLabel="最近浏览操作"
      description="打开过的笔记会显示在这里。"
      header="暂无最近浏览"
      headingLevel={2}
      headingSize="xsmall"
      primaryAction={
        <Button appearance="primary" onClick={onClose}>
          返回内容目录
        </Button>
      }
      width="narrow"
    />
  );
}

function RecentErrorState({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Stack space="space.300">
      <SectionMessage
        appearance="error"
        headingLevel="h2"
        title="无法加载最近浏览"
      >
        <Text as="p">
          读取本地笔记列表时出现问题。请检查 Profile 是否已解锁后重试。
        </Text>
        <Button appearance="danger" onClick={onRetry} spacing="compact">
          重试
        </Button>
      </SectionMessage>
      <Text as="p" color="color.text.subtle" size="small">
        不会影响已保存在本地的笔记内容。
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
            按最近浏览时间排序
          </Text>
          <MenuGroup menuLabel="最近浏览笔记" role="list">
            <Section isList>
              {items.map((note) => {
                const title = note.title || '无标题';
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
                加载更多
              </Button>
            </Inline>
          ) : null}
        </Stack>
      </Box>
    </ModalBody>
  );
}
