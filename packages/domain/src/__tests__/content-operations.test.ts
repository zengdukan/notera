import {
  DomainError,
  asAdfDocument,
  asAttachmentId,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTagId,
  asTagName,
  asTimestamp,
  asVaultId,
  addFavorite,
  addNoteTag,
  copyFolderTree,
  copyNote,
  createCurrentNoteAttachmentReference,
  createFavorite,
  createNote,
  createRegularFolder,
  createRootFolder,
  createTag,
  moveFolder,
  moveNote,
  removeFavorite,
  removeNoteTag,
  renameFolder,
  updateNoteContent,
} from '..';

const uuid = <T extends string>(suffix: T) =>
  `20000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const vaultId = asVaultId(uuid('1'));
const now = asTimestamp(1_000);
const later = asTimestamp(2_000);
const emptyDocument = asAdfDocument({ type: 'doc', version: 1, content: [] });

const root = createRootFolder({
  id: asFolderId(uuid('2')),
  vaultId,
  createdAt: now,
});
const parent = createRegularFolder({
  id: asFolderId(uuid('3')),
  vaultId,
  parentId: root.id,
  name: asFolderName('Parent'),
  sortOrder: asSortOrder(0),
  createdAt: now,
  updatedAt: now,
});
const child = createRegularFolder({
  id: asFolderId(uuid('4')),
  vaultId,
  parentId: parent.id,
  name: asFolderName('Child'),
  sortOrder: asSortOrder(0),
  createdAt: now,
  updatedAt: now,
});
const note = createNote({
  id: asNoteId(uuid('5')),
  vaultId,
  folderId: child.id,
  title: 'Original',
  document: emptyDocument,
  sortOrder: asSortOrder(0),
  createdAt: now,
  updatedAt: now,
});
const tag = createTag({
  id: asTagId(uuid('6')),
  vaultId,
  name: asTagName('work'),
  createdAt: now,
  updatedAt: now,
});

describe('content operations', () => {
  it('rejects root changes and folder cycles', () => {
    expect(() => renameFolder(root, asFolderName('Root'), later)).toThrow(
      DomainError,
    );
    expect(() =>
      moveFolder({
        folder: parent,
        targetParent: child,
        folders: [root, parent, child],
        sortOrder: asSortOrder(1),
        updatedAt: later,
      }),
    ).toThrow(expect.objectContaining({ code: 'FOLDER_CYCLE' }));
  });

  it('moves a folder without mutating the input snapshot', () => {
    const snapshot = [root, parent, child] as const;
    const moved = moveFolder({
      folder: child,
      targetParent: root,
      folders: snapshot,
      sortOrder: asSortOrder(3),
      updatedAt: later,
    });

    expect(moved).toMatchObject({ parentId: root.id, sortOrder: 3 });
    expect(child.parentId).toBe(parent.id);
    expect(snapshot[2]).toBe(child);
  });

  it('increments content version only for title or ADF changes', () => {
    const changed = updateNoteContent(note, {
      title: 'Changed',
      document: asAdfDocument({
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph' }],
      }),
      updatedAt: later,
    });
    const moved = moveNote({
      note: changed,
      targetFolder: parent,
      sortOrder: asSortOrder(5),
      updatedAt: asTimestamp(3_000),
    });

    expect(changed.contentVersion).toBe(2);
    expect(moved.contentVersion).toBe(2);
    expect(note.contentVersion).toBe(1);
  });

  it('adds and removes tags and favorites idempotently', () => {
    const noteTags = addNoteTag(note, tag, []);
    const duplicateTags = addNoteTag(note, tag, noteTags);
    const favorite = createFavorite({
      vaultId,
      noteId: note.id,
      sortOrder: asSortOrder(0),
      createdAt: now,
    });
    const favorites = addFavorite(note, favorite, []);

    expect(duplicateTags).toHaveLength(1);
    expect(removeNoteTag(note.id, tag.id, duplicateTags)).toEqual([]);
    expect(removeNoteTag(note.id, tag.id, [])).toEqual([]);
    expect(addFavorite(note, favorite, favorites)).toHaveLength(1);
    expect(removeFavorite(note.id, favorites)).toEqual([]);
  });

  it('rejects content relationships across vaults', () => {
    const otherVault = asVaultId(uuid('20'));
    const otherTag = createTag({
      id: asTagId(uuid('21')),
      vaultId: otherVault,
      name: asTagName('other'),
      createdAt: now,
      updatedAt: now,
    });

    expect(() => addNoteTag(note, otherTag, [])).toThrow(
      expect.objectContaining({ code: 'VAULT_MISMATCH' }),
    );
  });

  it('copies current note data, tags, and current attachment references only', () => {
    const noteTags = addNoteTag(note, tag, []);
    const attachmentId = asAttachmentId(uuid('7'));
    const references = [
      createCurrentNoteAttachmentReference({
        vaultId,
        attachmentId,
        noteId: note.id,
      }),
    ];
    const newNoteId = asNoteId(uuid('8'));

    const plan = copyNote({
      source: note,
      newNoteId,
      targetFolder: parent,
      sortOrder: asSortOrder(2),
      noteTags,
      attachmentReferences: references,
      createdAt: later,
    });

    expect(plan.note).toMatchObject({
      id: newNoteId,
      folderId: parent.id,
      contentVersion: 1,
      title: note.title,
    });
    expect(plan.noteTags).toEqual([
      expect.objectContaining({ noteId: newNoteId, tagId: tag.id }),
    ]);
    expect(plan.attachmentReferences).toEqual([
      expect.objectContaining({ noteId: newNoteId, attachmentId }),
    ]);
    expect(note.id).not.toBe(newNoteId);
  });

  it('copies a folder subtree with current notes and reusable relationships', () => {
    const attachmentId = asAttachmentId(uuid('9'));
    const plan = copyFolderTree({
      sourceFolderId: parent.id,
      targetParent: root,
      folders: [root, parent, child],
      notes: [note],
      noteTags: addNoteTag(note, tag, []),
      attachmentReferences: [
        createCurrentNoteAttachmentReference({
          vaultId,
          attachmentId,
          noteId: note.id,
        }),
      ],
      folderIdMap: new Map([
        [parent.id, asFolderId(uuid('10'))],
        [child.id, asFolderId(uuid('11'))],
      ]),
      noteIdMap: new Map([[note.id, asNoteId(uuid('12'))]]),
      createdAt: later,
    });

    const copiedParent = plan.folders.find(
      (folder) => folder.id === asFolderId(uuid('10')),
    );
    const copiedChild = plan.folders.find(
      (folder) => folder.id === asFolderId(uuid('11')),
    );
    expect(copiedParent).toMatchObject({ parentId: root.id });
    expect(copiedChild).toMatchObject({ parentId: copiedParent?.id });
    expect(plan.notes[0]).toMatchObject({
      id: asNoteId(uuid('12')),
      folderId: copiedChild?.id,
      contentVersion: 1,
    });
    expect(plan.noteTags).toHaveLength(1);
    expect(plan.attachmentReferences).toHaveLength(1);
  });

  it('rejects incomplete or duplicate subtree ID mappings', () => {
    const duplicateId = asFolderId(uuid('10'));
    expect(() =>
      copyFolderTree({
        sourceFolderId: parent.id,
        targetParent: root,
        folders: [root, parent, child],
        notes: [note],
        noteTags: [],
        attachmentReferences: [],
        folderIdMap: new Map([
          [parent.id, duplicateId],
          [child.id, duplicateId],
        ]),
        noteIdMap: new Map(),
        createdAt: later,
      }),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_TARGET_ID' }));

    expect(() =>
      copyFolderTree({
        sourceFolderId: parent.id,
        targetParent: root,
        folders: [root, parent, child],
        notes: [note],
        noteTags: [],
        attachmentReferences: [],
        folderIdMap: new Map([
          [parent.id, asFolderId(uuid('13'))],
          [child.id, asFolderId(uuid('14'))],
        ]),
        noteIdMap: new Map(),
        createdAt: later,
      }),
    ).toThrow(expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }));
  });
});
