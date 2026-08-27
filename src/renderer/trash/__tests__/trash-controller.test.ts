import { QueryClient } from '@tanstack/react-query';

import {
  NoteraClientError,
  type NoteraClient,
} from '../../platform/notera-client';
import { createTrashController } from '../trash-controller';

describe('trash controller', () => {
  it('switches to target selection when Main requires a restore target', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(new NoteraClientError('TRASH_TARGET_REQUIRED'))
      .mockResolvedValueOnce({});
    const controller = createTrashController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
    });

    await expect(controller.restore({ trashEntryId: 'trash' })).resolves.toBe(
      'target-required',
    );
    await expect(
      controller.restore({ trashEntryId: 'trash', targetFolderId: 'folder' }),
    ).resolves.toBe('restored');
    expect(request).toHaveBeenNthCalledWith(1, 'trash.restore', {
      trashEntryId: 'trash',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'trash.restore', {
      trashEntryId: 'trash',
      targetFolderId: 'folder',
    });
    expect(request).not.toHaveBeenCalledWith(
      'trash.purgeExpired',
      expect.anything(),
    );
  });

  it('permanently deletes only the requested trash entry', async () => {
    const request = jest.fn().mockResolvedValue({ deletedCount: 3 });
    const controller = createTrashController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
    });

    await expect(controller.deletePermanent('trash')).resolves.toBe('deleted');
    expect(request).toHaveBeenCalledWith('trash.deletePermanent', {
      trashEntryId: 'trash',
    });
  });
});
