import {
  asNoteId,
  asSortOrder,
  asTimestamp,
  asVaultId,
  createFavorite,
} from '@notera/domain';

import { createProfileManager } from '../manager';
import { prepareFavoriteAppend } from '../local-notes/favorites';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('LocalNotesService note relations', () => {
  it('densifies favorite ordering before the safe integer boundary', () => {
    const vaultId = asVaultId('10000000-0000-4000-8000-000000000001');
    const favorites = [
      createFavorite({
        vaultId,
        noteId: asNoteId('20000000-0000-4000-8000-000000000001'),
        sortOrder: asSortOrder(40),
        createdAt: asTimestamp(1),
      }),
      createFavorite({
        vaultId,
        noteId: asNoteId('20000000-0000-4000-8000-000000000002'),
        sortOrder: asSortOrder(Number.MAX_SAFE_INTEGER),
        createdAt: asTimestamp(2),
      }),
    ];

    const append = prepareFavoriteAppend(favorites);

    expect(append.favorites.map(({ sortOrder }) => sortOrder)).toEqual([0, 1]);
    expect(append.sortOrder).toBe(2);
    expect(favorites.map(({ sortOrder }) => sortOrder)).toEqual([
      40,
      Number.MAX_SAFE_INTEGER,
    ]);
  });

  it('manages normalized tags and idempotent note-tag relations', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Relations',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const note = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Tagged note',
    });

    const work = await localNotes.createTag('  work  ');
    const personal = await localNotes.createTag('personal');
    expect(work).toMatchObject({ name: 'work', updatedAt: expect.any(Number) });
    expect((await localNotes.listTags({ limit: 1 })).items).toEqual([work]);
    await expect(localNotes.createTag('   ')).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    await expect(localNotes.createTag('x'.repeat(101))).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    await expect(localNotes.createTag('work')).rejects.toMatchObject({
      code: 'SAVE_FAILED',
    });

    const renamed = await localNotes.renameTag({
      tagId: personal.id,
      name: '  home  ',
    });
    expect(renamed.name).toBe('home');
    await expect(
      localNotes.renameTag({ tagId: renamed.id, name: 'work' }),
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' });

    await localNotes.addTagToNote({ noteId: note.id, tagId: work.id });
    await localNotes.addTagToNote({ noteId: note.id, tagId: work.id });
    expect((await localNotes.getNote(note.id)).tags).toEqual([work]);

    const copied = await localNotes.copyNote({
      noteId: note.id,
      targetFolderId: profile.rootFolderId,
    });
    expect((await localNotes.getNote(copied.id)).tags).toEqual([work]);

    await localNotes.removeTagFromNote({ noteId: note.id, tagId: work.id });
    await localNotes.removeTagFromNote({ noteId: note.id, tagId: work.id });
    expect((await localNotes.getNote(note.id)).tags).toEqual([]);

    await localNotes.addTagToNote({ noteId: note.id, tagId: work.id });
    await localNotes.deleteTag(work.id);
    expect((await localNotes.getNote(note.id)).tags).toEqual([]);
    await expect(localNotes.deleteTag(work.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });

    await manager.close();
  }, 60_000);

  it('manages paged favorites and reorders without touching notes', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Favorites',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const first = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'First',
    });
    const second = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Second',
    });
    const third = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Third',
    });
    const timestamps = new Map(
      [first, second, third].map(({ id, updatedAt }) => [id, updatedAt]),
    );

    await localNotes.addFavorite(first.id);
    await localNotes.addFavorite(second.id);
    await localNotes.addFavorite(third.id);
    await localNotes.addFavorite(first.id);

    const page = await localNotes.listFavorites({ limit: 2 });
    expect(
      page.items.map(({ id, favoriteSortOrder }) => [id, favoriteSortOrder]),
    ).toEqual([
      [first.id, 0],
      [second.id, 1],
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    await expect(
      localNotes.listFavorites({ limit: 2, cursor: page.nextCursor }),
    ).resolves.toMatchObject({
      items: [{ id: third.id, favoriteSortOrder: 2 }],
    });

    await localNotes.reorderFavorite({
      noteId: third.id,
      beforeNoteId: first.id,
    });
    expect(
      (await localNotes.listFavorites({ limit: 10 })).items.map(({ id }) => id),
    ).toEqual([third.id, first.id, second.id]);
    await localNotes.reorderFavorite({
      noteId: third.id,
      beforeNoteId: third.id,
    });
    await localNotes.reorderFavorite({ noteId: first.id });
    expect(
      (await localNotes.listFavorites({ limit: 10 })).items.map(({ id }) => id),
    ).toEqual([third.id, second.id, first.id]);
    await expect(
      localNotes.reorderFavorite({
        noteId: first.id,
        beforeNoteId: '40000000-0000-4000-8000-000000000999' as typeof first.id,
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });

    for (const summary of [first, second, third]) {
      expect((await localNotes.getNote(summary.id)).updatedAt).toBe(
        timestamps.get(summary.id),
      );
    }

    await localNotes.removeFavorite(first.id);
    await localNotes.removeFavorite(first.id);
    await localNotes.trashNote(second.id);
    expect(
      (await localNotes.listFavorites({ limit: 10 })).items.map(({ id }) => id),
    ).toEqual([third.id]);
    await expect(localNotes.addFavorite(second.id)).rejects.toMatchObject({
      code: 'ENTITY_NOT_FOUND',
    });

    await manager.close();
  }, 60_000);
});
