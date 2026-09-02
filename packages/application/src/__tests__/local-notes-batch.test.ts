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
    const nestedAttachment = await manager.localAttachments.importAttachment({
      noteId: nested.id,
      fileName: 'nested.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([1]);
      })(),
    });
    const siblingAttachment = await manager.localAttachments.importAttachment({
      noteId: sibling.id,
      fileName: 'sibling.bin',
      mimeType: 'application/octet-stream',
      source: (async function* attachmentSource() {
        yield new Uint8Array([2]);
      })(),
    });
    await localNotes.addFavorite(nested.id);
    await localNotes.addFavorite(sibling.id);

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
    await expect(
      manager.localAttachments.listForNote({
        noteId: copiedNested.id,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: nestedAttachment.id })],
    });
    const copiedSibling = rootItems.find(
      (item) => item.kind === 'note' && item.title === 'Sibling',
    );
    if (copiedSibling?.kind !== 'note') throw new Error('Missing copied note');
    await expect(
      manager.localAttachments.listForNote({
        noteId: copiedSibling.id,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: siblingAttachment.id })],
    });

    const trashed = await localNotes.batchTrash({
      targets: [
        { kind: 'folder', id: child.id },
        { kind: 'note', id: sibling.id },
      ],
    });
    expect(trashed.trashEntryIds).toHaveLength(2);
    expect((await localNotes.listTrash({ limit: 10 })).items).toHaveLength(2);
    for (const trashEntryId of trashed.trashEntryIds) {
      await localNotes.restoreTrash({ trashEntryId });
    }
    await expect(localNotes.getNote(nested.id)).resolves.toMatchObject({
      isFavorite: false,
    });
    await expect(localNotes.getNote(sibling.id)).resolves.toMatchObject({
      isFavorite: false,
    });
    expect((await localNotes.listFavorites({ limit: 10 })).items).toEqual([]);

    await manager.close();
  }, 60_000);
});
