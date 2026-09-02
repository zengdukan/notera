import { QueryClient } from '@tanstack/react-query';

import {
  NoteraClientError,
  type NoteraClient,
} from '../../platform/notera-client';
import { ActiveDocumentLifecycle } from '../../notes/document-lifecycle';
import { NoteWriteCoordinator } from '../../notes/note-write-coordinator';
import { createHistoryController } from '../history-controller';

describe('history controller', () => {
  it('copies history with a title and invalidates the target folder', async () => {
    const request = jest.fn().mockResolvedValue({});
    const queryClient = new QueryClient();
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const controller = createHistoryController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      queryClient,
      profileId: 'profile',
      lifecycle: new ActiveDocumentLifecycle(),
      writeCoordinator: new NoteWriteCoordinator(),
      onRestored: jest.fn(),
    });

    await controller.copy({
      noteId: 'note',
      versionId: 'version',
      targetFolderId: 'folder',
      title: 'Copied note',
    });

    expect(request).toHaveBeenCalledWith('history.copy', {
      noteId: 'note',
      versionId: 'version',
      targetFolderId: 'folder',
      title: 'Copied note',
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'tree', 'folder'],
    });
  });

  it('flushes before create and restores serially from the latest saved content version', async () => {
    const calls: string[] = [];
    const lifecycle = new ActiveDocumentLifecycle();
    lifecycle.attach({
      isDirty: () => true,
      flush: async () => {
        calls.push('flush');
      },
      stop: jest.fn(),
    });
    const detail = {
      kind: 'note' as const,
      id: 'note',
      title: 'Current',
      folderId: 'folder',
      contentVersion: 5,
      updatedAt: 1,
      createdAt: 1,
      document: { type: 'doc' as const, version: 1 as const },
      isFavorite: false,
      tags: [],
    };
    const restored = { ...detail, title: 'Restored', contentVersion: 6 };
    let noteReads = 0;
    let restoreInput: unknown;
    const request = jest.fn(async (key: string, input: unknown) => {
      calls.push(key);
      if (key === 'history.createPermanent')
        return {
          versionId: 'version',
          noteId: 'note',
          kind: 'USER',
          protectionReason: null,
          versionName: 'Milestone',
          displayTitle: 'Current',
          createdAt: 1,
        };
      if (key === 'note.get') {
        const value = noteReads === 0 ? detail : restored;
        noteReads += 1;
        return value;
      }
      if (key === 'history.restore') {
        restoreInput = input;
        return {
          noteId: 'note',
          contentVersion: 6,
          protectionVersionId: 'protection',
        };
      }
      throw new Error(`Unexpected ${key}`);
    });
    const onRestored = jest.fn();
    const controller = createHistoryController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
      lifecycle,
      writeCoordinator: new NoteWriteCoordinator(),
      onRestored,
    });

    await controller.create({ noteId: 'note', versionName: 'Milestone' });
    expect(calls.slice(0, 2)).toEqual(['flush', 'history.createPermanent']);
    calls.length = 0;
    await controller.restore({ noteId: 'note', versionId: 'version' });
    expect(restoreInput).toEqual({
      noteId: 'note',
      versionId: 'version',
      expectedContentVersion: 5,
    });
    expect(calls).toEqual(['flush', 'note.get', 'history.restore', 'note.get']);
    expect(onRestored).toHaveBeenCalledWith(restored);
  });

  it('reports a missing note separately during restore', async () => {
    const onMissing = jest.fn();
    const controller = createHistoryController({
      client: {
        request: jest
          .fn()
          .mockRejectedValue(new NoteraClientError('ENTITY_NOT_FOUND')),
        subscribe: jest.fn(),
      } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
      lifecycle: new ActiveDocumentLifecycle(),
      writeCoordinator: new NoteWriteCoordinator(),
      onRestored: jest.fn(),
      onMissing,
    });

    await expect(
      controller.restore({ noteId: 'note', versionId: 'version' }),
    ).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });
    expect(onMissing).toHaveBeenCalledWith('note');
  });
});
