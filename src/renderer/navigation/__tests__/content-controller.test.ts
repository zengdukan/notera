import { QueryClient } from '@tanstack/react-query';

import type { NoteraClient } from '../../platform/notera-client';
import { NoteWriteCoordinator } from '../../notes/note-write-coordinator';
import { createContentController } from '../content-controller';

const note = {
  kind: 'note' as const,
  id: 'note',
  title: 'Note',
  folderId: 'root',
  contentVersion: 1,
  updatedAt: 1,
};

describe('content controller', () => {
  it('creates an empty-title note in context and selects it for editing', async () => {
    const request = jest.fn(async () => ({
      ...note,
      document: { type: 'doc', version: 1 },
      createdAt: 1,
      tags: [],
    }));
    const select = jest.fn();
    const beginEditing = jest.fn();
    const controller = createContentController({
      client: { request } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
      rootFolderId: 'root',
      getSelection: () => ({ kind: 'note', id: 'current', folderId: 'parent' }),
      guard: { flushBefore: jest.fn(async () => 'ready') },
      select,
      beginEditing,
    });
    await controller.createNote();
    expect(request).toHaveBeenCalledWith('note.create', {
      folderId: 'parent',
      title: '',
    });
    expect(select).toHaveBeenCalledWith(note);
    expect(beginEditing).toHaveBeenCalledWith('note');
  });

  it('blocks current-note move/copy/trash when the save guard cannot flush', async () => {
    const request = jest.fn();
    const guard = { flushBefore: jest.fn(async () => 'blocked' as const) };
    const controller = createContentController({
      client: { request } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
      rootFolderId: 'root',
      getSelection: () => note,
      guard,
      select: jest.fn(),
      beginEditing: jest.fn(),
    });
    await expect(controller.move(note, 'target')).resolves.toBe('blocked');
    await expect(controller.copy(note, 'target')).resolves.toBe('blocked');
    await expect(controller.trash(note)).resolves.toBe('blocked');
    expect(request).not.toHaveBeenCalled();
  });

  it('updates the current selection and invalidates only related caches after note mutations', async () => {
    const renamed = {
      ...note,
      title: 'Renamed',
      contentVersion: 2,
      updatedAt: 2,
    };
    const moved = {
      ...renamed,
      folderId: 'target',
      contentVersion: 3,
      updatedAt: 3,
    };
    const request = jest.fn(async (key: string) =>
      key === 'note.rename' ? renamed : moved,
    );
    const queryClient = new QueryClient();
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const select = jest.fn();
    let selection = note;
    const controller = createContentController({
      client: { request } as unknown as NoteraClient,
      queryClient,
      profileId: 'profile',
      rootFolderId: 'root',
      getSelection: () => selection,
      guard: { flushBefore: jest.fn(async () => 'ready') },
      select: (entry) => {
        select(entry);
        if (entry?.kind === 'note') selection = entry;
      },
      beginEditing: jest.fn(),
    });

    await controller.rename(note, 'Renamed');
    expect(select).toHaveBeenLastCalledWith(renamed);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'tree', 'root'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'note', 'note'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'recent'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'favorites'],
    });

    invalidate.mockClear();
    await controller.move(renamed, 'target');
    expect(select).toHaveBeenLastCalledWith(moved);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'tree', 'root'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'tree', 'target'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'path'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'profile', 'search'],
    });
  });

  it('serializes note renames through the shared note writer', async () => {
    const renamed = {
      ...note,
      title: 'Renamed',
      contentVersion: 2,
      updatedAt: 2,
    };
    const request = jest.fn(async () => renamed);
    const writer = new NoteWriteCoordinator();
    const run = jest.spyOn(writer, 'run');
    const controller = createContentController({
      client: { request } as unknown as NoteraClient,
      queryClient: new QueryClient(),
      profileId: 'profile',
      rootFolderId: 'root',
      getSelection: () => note,
      guard: { flushBefore: jest.fn(async () => 'ready') },
      writeCoordinator: writer,
      select: jest.fn(),
      beginEditing: jest.fn(),
    });

    await controller.rename(note, 'Renamed');

    expect(run).toHaveBeenCalledWith('note', expect.any(Function));
    expect(request).toHaveBeenCalledWith('note.rename', {
      noteId: 'note',
      title: 'Renamed',
    });
  });
});
