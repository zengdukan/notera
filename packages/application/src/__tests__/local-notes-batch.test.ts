import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

describe('LocalNotesService atomic batches', () => {
  it('rejects covered targets and applies move, relation, copy, and trash batches', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'Batch',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const parent = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'Parent',
    });
    const child = await localNotes.createFolder({
      parentFolderId: parent.id,
      name: 'Child',
    });
    const target = await localNotes.createFolder({
      parentFolderId: profile.rootFolderId,
      name: 'Target',
    });
    const nested = await localNotes.createNote({
      folderId: child.id,
      title: 'Nested',
    });
    const sibling = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Sibling',
    });

    await expect(
      localNotes.batchMove({
        targets: [
          { kind: 'folder', id: parent.id },
          { kind: 'note', id: nested.id },
        ],
        targetFolderId: target.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ENTITY_STATE' });
    expect((await localNotes.getNote(nested.id)).folderId).toBe(child.id);
    await expect(
      localNotes.batchMove({ targets: [], targetFolderId: target.id }),
    ).rejects.toMatchObject({ code: 'INVALID_ENTITY_STATE' });

    await localNotes.batchMove({
      targets: [
        { kind: 'folder', id: child.id },
        { kind: 'note', id: sibling.id },
      ],
      targetFolderId: target.id,
    });
    expect((await localNotes.getNote(sibling.id)).folderId).toBe(target.id);

    const tag = await localNotes.createTag('batch');
    await localNotes.batchAddTags({
      noteIds: [nested.id, sibling.id],
      tagIds: [tag.id],
    });
    expect((await localNotes.getNote(nested.id)).tags).toEqual([tag]);
    expect((await localNotes.getNote(sibling.id)).tags).toEqual([tag]);
    await localNotes.batchRemoveTags({
      noteIds: [sibling.id],
      tagIds: [tag.id],
    });

    await localNotes.batchCopy({
      targets: [
        { kind: 'folder', id: child.id },
        { kind: 'note', id: sibling.id },
      ],
      targetFolderId: profile.rootFolderId,
    });
    const rootItems = (
      await localNotes.listChildren({
        parentFolderId: profile.rootFolderId,
        limit: 20,
        sort: { field: 'TITLE', direction: 'ASC' },
      })
    ).items;
    expect(rootItems.filter(({ kind }) => kind === 'folder')).toHaveLength(3);
    expect(
      rootItems.filter(
        (item) => item.kind === 'note' && item.title === 'Sibling',
      ),
    ).toHaveLength(1);
    const copiedChild = rootItems.find(
      (item) => item.kind === 'folder' && item.name === 'Child',
    );
    if (copiedChild?.kind !== 'folder')
      throw new Error('Missing copied folder');
    const copiedNested = (
      await localNotes.listChildren({
        parentFolderId: copiedChild.id,
        limit: 10,
      })
    ).items.find((item) => item.kind === 'note' && item.title === 'Nested');
    if (copiedNested?.kind !== 'note') throw new Error('Missing copied note');
    expect((await localNotes.getNote(copiedNested.id)).tags).toEqual([tag]);

    const trashed = await localNotes.batchTrash({
      targets: [
        { kind: 'folder', id: child.id },
        { kind: 'note', id: sibling.id },
      ],
    });
    expect(trashed.trashEntryIds).toHaveLength(2);
    expect((await localNotes.listTrash({ limit: 10 })).items).toHaveLength(2);

    await manager.close();
  }, 60_000);
});
