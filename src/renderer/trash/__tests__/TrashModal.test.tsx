/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { localVersionName } from '../../history/local-version-name';
import type { NoteraClient } from '../../platform/notera-client';
import { ModalHost } from '../../shared-ui/ModalHost';
import type { TrashController } from '../trash-controller';
import { TrashModal } from '../TrashModal';

const noteItem = {
  trashEntryId: 'trash-note',
  objectId: 'note',
  kind: 'note' as const,
  displayName: 'Deleted note',
  folderPath: [
    { id: 'root', name: '' },
    { id: 'archive', name: 'Archive' },
  ],
  deletedAt: 1,
  expiresAt: 2,
  originalParentAvailable: true,
};
const folderItem = {
  trashEntryId: 'trash-folder',
  objectId: 'folder',
  kind: 'folder' as const,
  displayName: 'Deleted folder',
  folderPath: [{ id: 'root', name: '' }],
  deletedAt: 3,
  expiresAt: 4,
  originalParentAvailable: false,
};

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

describe('TrashModal', () => {
  it('restores single items and requires confirmation for one permanent delete', async () => {
    const user = userEvent.setup();
    const request = jest
      .fn()
      .mockResolvedValue({ items: [noteItem, folderItem] });
    const restore = jest.fn().mockResolvedValue('restored');
    const deletePermanent = jest.fn().mockResolvedValue('deleted');
    const controller = {
      restore,
      deletePermanent,
    } as unknown as TrashController;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <ModalHost
          modal={{
            kind: 'trash-bin',
            title: 'Trash',
            content: (
              <TrashModal
                client={
                  { request, subscribe: jest.fn() } as unknown as NoteraClient
                }
                profileId="profile"
                rootFolderId="root"
                folders={[{ id: 'target', name: 'Target', depth: 0 }]}
                controller={controller}
              />
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    const noteRow = await screen.findByRole('button', {
      name: /^Deleted note \/ Archive · Deleted /,
    });
    expect(noteRow).toBeVisible();
    expect(
      screen.getByText(
        `/ Archive · Deleted ${localVersionName(new Date(noteItem.deletedAt))}`,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        `/ · Deleted ${localVersionName(new Date(folderItem.deletedAt))}`,
      ),
    ).toBeVisible();
    expect(screen.getByTestId('trash-note-icon')).toBeVisible();
    expect(screen.getByTestId('trash-folder-icon')).toBeVisible();
    expect(screen.queryByText(/^Expires /)).not.toBeInTheDocument();

    await user.hover(noteRow);
    const restoreNote = screen.getByRole('button', {
      name: 'Restore Deleted note',
    });
    const deleteNote = screen.getByRole('button', {
      name: 'Delete Deleted note permanently',
    });
    noteRow.focus();
    await user.tab();
    expect(restoreNote).toHaveFocus();
    await user.tab();
    expect(deleteNote).toHaveFocus();

    await user.click(restoreNote);
    expect(restore).toHaveBeenCalledWith({ trashEntryId: 'trash-note' });
    expect(await screen.findByText('Restored Deleted note')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Restore Deleted folder' }),
    );
    expect(
      screen.getByRole('button', { name: 'Restore to selected folder' }),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('notera-modal-trash-bin--footer')).getByRole(
        'button',
        { name: 'Restore to selected folder' },
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Target' }));
    await user.click(
      screen.getByRole('button', { name: 'Restore to selected folder' }),
    );
    expect(restore).toHaveBeenCalledWith({
      trashEntryId: 'trash-folder',
      targetFolderId: 'target',
    });

    await user.click(
      screen.getByRole('button', { name: 'Delete Deleted note permanently' }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Permanently delete Deleted note?',
      }),
    ).toBeVisible();
    expect(screen.getByText('This cannot be undone.')).toBeVisible();
    expect(
      within(screen.getByTestId('notera-modal-trash-bin--footer')).getByRole(
        'button',
        { name: 'Delete permanently' },
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deletePermanent).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Delete Deleted note permanently' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Delete permanently' }),
    );
    await waitFor(() =>
      expect(deletePermanent).toHaveBeenCalledWith('trash-note'),
    );
    expect(request).not.toHaveBeenCalledWith(
      'trash.purgeExpired',
      expect.anything(),
    );
  }, 15_000);
});
