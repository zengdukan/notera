/** @jest-environment jsdom */

import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import type { TrashController } from '../trash-controller';
import { TrashModal } from '../TrashModal';

const noteItem = {
  trashEntryId: 'trash-note',
  objectId: 'note',
  kind: 'note' as const,
  displayName: 'Deleted note',
  deletedAt: 1,
  expiresAt: 2,
  originalParentAvailable: true,
};
const folderItem = {
  trashEntryId: 'trash-folder',
  objectId: 'folder',
  kind: 'folder' as const,
  displayName: 'Deleted folder',
  deletedAt: 3,
  expiresAt: 4,
  originalParentAvailable: false,
};

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
        <TrashModal
          client={{ request, subscribe: jest.fn() } as unknown as NoteraClient}
          profileId="profile"
          rootFolderId="root"
          folders={[{ id: 'target', name: 'Target', depth: 0 }]}
          controller={controller}
        />
      </AppProviders>,
    );

    expect(await screen.findByText('Deleted note')).toBeVisible();
    expect(screen.getByText('Note')).toBeVisible();
    expect(screen.getByText('Folder')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Restore Deleted note' }),
    );
    expect(restore).toHaveBeenCalledWith({ trashEntryId: 'trash-note' });

    await user.click(
      screen.getByRole('button', { name: 'Restore Deleted folder' }),
    );
    expect(
      screen.getByRole('button', { name: 'Restore to selected folder' }),
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
    expect(screen.getByText('This cannot be undone.')).toBeVisible();
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
  });
});
