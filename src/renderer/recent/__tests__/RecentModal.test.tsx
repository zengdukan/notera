/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { createAppQueryClient } from '../../app/query-client';
import type { NoteraClient } from '../../platform/notera-client';
import { RecentModal } from '../RecentModal';

const folderId = '10000000-0000-4000-8000-000000000003';
const note = {
  kind: 'note' as const,
  id: '10000000-0000-4000-8000-000000000004',
  title: 'Recent note',
  folderId,
  contentVersion: 1,
  updatedAt: new Date(2026, 8, 1, 14, 32).getTime(),
};
const secondNote = {
  ...note,
  id: '10000000-0000-4000-8000-000000000005',
  title: 'Second note',
};
const folderPath = [
  { id: '10000000-0000-4000-8000-000000000001', name: '研究资料' },
  { id: folderId, name: '产品策略' },
];

function clientWithPages(
  pages: readonly {
    readonly items: readonly (typeof note)[];
    readonly nextCursor?: string;
  }[],
) {
  let pageIndex = 0;
  const request = jest.fn(async (key: string) => {
    if (key === 'contentTree.getFolderPath') return { items: folderPath };
    const page = pages[Math.min(pageIndex, pages.length - 1)];
    pageIndex += 1;
    return page;
  });
  return {
    client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
    request,
  };
}

function renderRecent({
  client,
  onOpen = jest.fn().mockResolvedValue(true),
  onClose = jest.fn(),
}: {
  readonly client: NoteraClient;
  readonly onOpen?: jest.Mock;
  readonly onClose?: jest.Mock;
}) {
  render(
    <AppProviders locale="zh-CN" queryClient={createAppQueryClient()}>
      <RecentModal
        client={client}
        profileId="profile"
        onOpen={onOpen}
        onClose={onClose}
      />
    </AppProviders>,
  );
  return { onClose, onOpen };
}

describe('RecentModal', () => {
  it('opens a note from a compact recent-notes menu without a separate open action', async () => {
    const user = userEvent.setup();
    const { client } = clientWithPages([{ items: [note] }]);
    const { onOpen } = renderRecent({ client });

    expect(await screen.findByText('Recent note')).toBeVisible();
    expect(screen.getByText(/^研究资料 \/ 产品策略 · /)).toBeVisible();
    expect(screen.getByText('按最近浏览时间排序')).toBeVisible();
    expect(screen.getByRole('menu', { name: '最近浏览笔记' })).toBeVisible();
    expect(screen.queryByText('打开笔记 →')).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /Recent note/ }));
    expect(onOpen).toHaveBeenCalledWith({ ...note, folderPath });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the approved skeleton and loading announcement while notes load', () => {
    const request = jest.fn(
      () =>
        new Promise(() => {
          // Keep the request pending to exercise the loading state.
        }),
    );
    renderRecent({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
    });

    expect(screen.getByText('正在加载最近浏览...')).toBeVisible();
    expect(screen.getByLabelText('正在加载最近浏览')).toBeVisible();
    expect(screen.getAllByTestId('recent-note-skeleton')).toHaveLength(3);
  });

  it('returns to the content tree from the empty state', async () => {
    const user = userEvent.setup();
    const { client } = clientWithPages([{ items: [] }]);
    const { onClose } = renderRecent({ client });

    expect(await screen.findByText('暂无最近浏览')).toBeVisible();
    expect(screen.getByText('打开过的笔记会显示在这里。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '返回内容目录' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries a failed recent-notes request in place', async () => {
    const user = userEvent.setup();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce({ items: [] });
    renderRecent({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
    });

    expect(await screen.findByText('无法加载最近浏览')).toBeVisible();
    expect(
      screen.getByText(
        '读取本地笔记列表时出现问题。请检查 Profile 是否已解锁后重试。',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('暂无最近浏览')).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('loads the next page once and keeps the local-profile disclosure', async () => {
    const user = userEvent.setup();
    const { client, request } = clientWithPages([
      { items: [note], nextCursor: 'next' },
      { items: [secondNote] },
    ]);
    renderRecent({ client });

    await screen.findByText('Recent note');
    await user.click(screen.getByRole('button', { name: '加载更多' }));

    expect(await screen.findByText('Second note')).toBeVisible();
    expect(
      screen.getByText('仅显示当前本地 Profile 中可用的笔记'),
    ).toBeVisible();
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('note.listRecent', {
        cursor: 'next',
        limit: 30,
      }),
    );
  });
});
