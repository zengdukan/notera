/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import { createContentActions } from '../content-actions';
import { ContentTree, type ContentTreeNode } from '../ContentTree';
import { QueryContentTree } from '../tree-queries';

const folder: ContentTreeNode = {
  entry: {
    kind: 'folder',
    id: 'folder-1',
    name: 'Projects',
    parentId: 'root',
    updatedAt: 1,
    hasChildren: true,
  },
  children: [],
};
const note: ContentTreeNode = {
  entry: {
    kind: 'note',
    id: 'note-1',
    title: 'Roadmap',
    folderId: 'root',
    contentVersion: 1,
    updatedAt: 1,
  },
};

describe('ContentTree', () => {
  it('uses ADS side-nav items while keeping selection and row actions wired', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    const onToggle = jest.fn();
    const onCreateNote = jest.fn();
    const onCreateFolder = jest.fn();
    const rename = jest.fn();
    const getActions = (entry: typeof folder.entry | typeof note.entry) =>
      createContentActions(entry, { rename });
    render(
      <AppProviders locale="en">
        <ContentTree
          nodes={[folder, note]}
          expandedIds={new Set()}
          selected={undefined}
          onOpen={onOpen}
          onToggle={onToggle}
          onCreateNote={onCreateNote}
          onCreateFolder={onCreateFolder}
          getActions={getActions}
        />
      </AppProviders>,
    );

    expect(screen.getByRole('list')).toBeVisible();
    const folderRow = screen.getByRole('button', { name: 'Projects' });
    await user.click(folderRow);
    expect(onOpen).toHaveBeenCalledWith(folder.entry);
    onOpen.mockClear();
    expect(onToggle).toHaveBeenCalledWith('folder-1', true);
    await user.click(
      screen.getByRole('button', { name: 'Create in Projects' }),
    );
    expect(screen.getByRole('menuitem', { name: 'New note' })).toBeVisible();
    expect(
      screen.getByRole('menuitem', { name: 'New subfolder' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: 'Rename' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'New note' }));
    expect(onCreateNote).toHaveBeenCalledWith(folder.entry);
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'More actions for Projects' }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'More actions for Projects' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(rename).toHaveBeenCalledWith(folder.entry);

    const noteRow = screen.getByRole('button', { name: 'Roadmap' });
    await user.click(noteRow);
    onOpen.mockClear();
    expect(
      screen.queryByRole('button', { name: 'Create in Roadmap' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  });

  it('does nothing when the blank tree area receives a context menu', async () => {
    const user = userEvent.setup();
    const action = jest.fn();
    render(
      <AppProviders locale="en">
        <ContentTree
          nodes={[note]}
          expandedIds={new Set()}
          onOpen={jest.fn()}
          onToggle={jest.fn()}
          onCreateNote={jest.fn()}
          onCreateFolder={jest.fn()}
          getActions={(entry) =>
            createContentActions(entry, { rename: action })
          }
        />
      </AppProviders>,
    );
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('list'),
    });
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('renders queried content with the same ADS side-nav item contract', async () => {
    const onOpen = jest.fn();
    const request = jest.fn(async () => ({
      items: [folder.entry, note.entry],
    }));
    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <QueryContentTree
          client={{ request } as unknown as NoteraClient}
          profileId="profile-1"
          rootFolderId="root"
          expandedIds={new Set()}
          onOpen={onOpen}
          onToggle={jest.fn()}
          onCreateNote={jest.fn()}
          onCreateFolder={jest.fn()}
          getActions={() => []}
        />
      </AppProviders>,
    );

    expect(await screen.findByRole('list')).toBeVisible();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Roadmap' }),
    );
    expect(onOpen).toHaveBeenCalledWith(note.entry);
    expect(request).toHaveBeenCalledWith('contentTree.listChildren', {
      parentFolderId: 'root',
      limit: 50,
    });
  });

  it('keeps a queried nested subtree mounted when its ADS folder collapses', async () => {
    const nestedNote = {
      ...note.entry,
      id: 'note-nested',
      title: 'Nested roadmap',
      folderId: folder.entry.id,
    };
    const request = jest.fn(
      async (_method: string, input: { readonly parentFolderId: string }) => ({
        items:
          input.parentFolderId === folder.entry.id
            ? [nestedNote]
            : [folder.entry],
      }),
    );
    const queryClient = new QueryClient();
    const tree = (expandedIds: ReadonlySet<string>) => (
      <AppProviders locale="en" queryClient={queryClient}>
        <QueryContentTree
          client={{ request } as unknown as NoteraClient}
          profileId="profile-1"
          rootFolderId="root"
          expandedIds={expandedIds}
          onOpen={jest.fn()}
          onToggle={jest.fn()}
          onCreateNote={jest.fn()}
          onCreateFolder={jest.fn()}
          getActions={() => []}
        />
      </AppProviders>
    );
    const { rerender } = render(tree(new Set([folder.entry.id])));

    expect(
      await screen.findByRole('button', { name: 'Nested roadmap' }),
    ).toBeVisible();

    rerender(tree(new Set()));

    expect(
      screen.getByRole('button', { name: 'Nested roadmap', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
