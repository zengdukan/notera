/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { createContentActions } from '../content-actions';
import { ContentTree, type ContentTreeNode } from '../ContentTree';

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
  it('provides tree semantics, keyboard navigation, and non-selecting row buttons', async () => {
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

    expect(screen.getByRole('tree')).toBeVisible();
    const folderRow = screen.getByRole('treeitem', { name: /Projects/ });
    await user.click(folderRow);
    expect(onOpen).toHaveBeenCalledWith(folder.entry);
    onOpen.mockClear();
    onToggle.mockClear();
    await user.keyboard('{ArrowRight}');
    expect(onToggle).toHaveBeenCalledWith('folder-1', true);
    await user.click(screen.getByRole('button', { name: 'Create in Projects' }));
    expect(screen.getByRole('menuitem', { name: 'New note' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'New subfolder' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'New note' }));
    expect(onCreateNote).toHaveBeenCalledWith(folder.entry);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'More actions for Projects' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'More actions for Projects' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(rename).toHaveBeenCalledWith(folder.entry);

    const noteRow = screen.getByRole('treeitem', { name: /Roadmap/ });
    await user.click(noteRow);
    onOpen.mockClear();
    expect(screen.queryByRole('button', { name: 'Create in Roadmap' })).not.toBeInTheDocument();
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
          getActions={(entry) => createContentActions(entry, { rename: action })}
        />
      </AppProviders>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('tree') });
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
