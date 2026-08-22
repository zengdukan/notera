import {
  TRASH_RETENTION_MS,
  asAdfDocument,
  asFolderId,
  asFolderName,
  asNoteId,
  asNoteVersionId,
  asSortOrder,
  asTimestamp,
  asTrashEntryId,
  asVaultId,
  asVersionName,
  createProtectionVersion,
  createNote,
  createRegularFolder,
  createRootFolder,
  createUserVersion,
  expiredTrashEntries,
  resolveTrashRestoreTarget,
  renameUserVersion,
  restoreNoteVersion,
  trashFolderTree,
  trashNote,
} from '..';

const uuid = (suffix: string) =>
  `30000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const vaultId = asVaultId(uuid('1'));
const now = asTimestamp(10_000);
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
const document = asAdfDocument({ type: 'doc', version: 1, content: [] });
const note = createNote({
  id: asNoteId(uuid('5')),
  vaultId,
  folderId: child.id,
  title: 'Current',
  document,
  sortOrder: asSortOrder(0),
  createdAt: now,
  updatedAt: now,
});

describe('history and trash rules', () => {
  it('creates a user snapshot without changing the current note', () => {
    const version = createUserVersion(
      note,
      asNoteVersionId(uuid('6')),
      asTimestamp(11_000),
      asVersionName('  提交前  '),
    );

    expect(version).toMatchObject({
      kind: 'USER',
      title: note.title,
      sourceContentVersion: 1,
      protectionReason: null,
      versionName: '提交前',
    });
    expect(note.contentVersion).toBe(1);
  });

  it('renames only user-version metadata and rejects protected versions', () => {
    const version = createUserVersion(
      note,
      asNoteVersionId(uuid('22')),
      asTimestamp(11_000),
    );
    const renamed = renameUserVersion(version, asVersionName('里程碑'));

    expect(renamed).toMatchObject({ kind: 'USER', versionName: '里程碑' });
    expect({ ...renamed, versionName: null }).toEqual(version);
    expect(renameUserVersion(renamed, null).versionName).toBeNull();
    expect(() => asVersionName('   ')).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );
    expect(() => asVersionName('x'.repeat(101))).toThrow(
      expect.objectContaining({ code: 'INVALID_NAME' }),
    );

    const protection = createProtectionVersion(
      note,
      asNoteVersionId(uuid('23')),
      'BEFORE_MIGRATION',
      asTimestamp(12_000),
    );
    expect(protection.versionName).toBeNull();
    expect(() => renameUserVersion(protection, null)).toThrow(
      expect.objectContaining({ code: 'INVALID_ENTITY_STATE' }),
    );
  });

  it('protects current content before restoring a historical snapshot', () => {
    const target = createUserVersion(
      { ...note, title: 'Historical' },
      asNoteVersionId(uuid('7')),
      asTimestamp(11_000),
    );
    const plan = restoreNoteVersion({
      note,
      version: target,
      protectionVersionId: asNoteVersionId(uuid('8')),
      restoredAt: asTimestamp(12_000),
    });

    expect(plan.protectionVersion).toMatchObject({
      kind: 'SYSTEM_PROTECTION',
      protectionReason: 'BEFORE_HISTORY_RESTORE',
      title: 'Current',
    });
    expect(plan.note).toMatchObject({ title: 'Historical', contentVersion: 2 });
    expect(note.title).toBe('Current');
  });

  it('rejects a version from another note or vault', () => {
    const target = createUserVersion(
      note,
      asNoteVersionId(uuid('9')),
      asTimestamp(11_000),
    );

    expect(() =>
      restoreNoteVersion({
        note: { ...note, id: asNoteId(uuid('10')) },
        version: target,
        protectionVersionId: asNoteVersionId(uuid('11')),
        restoredAt: asTimestamp(12_000),
      }),
    ).toThrow(expect.objectContaining({ code: 'VERSION_NOTE_MISMATCH' }));
  });

  it('uses an exact 30-day trash retention boundary', () => {
    const plan = trashNote({
      note,
      trashEntryId: asTrashEntryId(uuid('12')),
      deletedAt: now,
    });
    const entry = plan.entries[0];

    expect(entry.expiresAt).toBe(now + TRASH_RETENTION_MS);
    expect(
      expiredTrashEntries(plan.entries, asTimestamp(entry.expiresAt - 1)),
    ).toEqual([]);
    expect(expiredTrashEntries(plan.entries, entry.expiresAt)).toEqual([entry]);

    expect(() =>
      trashNote({
        note,
        trashEntryId: asTrashEntryId(uuid('18')),
        deletedAt: asTimestamp(Number.MAX_SAFE_INTEGER),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it('creates one trash entry for every folder and note in a subtree', () => {
    const plan = trashFolderTree({
      sourceFolderId: parent.id,
      folders: [root, parent, child],
      notes: [note],
      folderTrashEntryIds: new Map([
        [parent.id, asTrashEntryId(uuid('13'))],
        [child.id, asTrashEntryId(uuid('14'))],
      ]),
      noteTrashEntryIds: new Map([[note.id, asTrashEntryId(uuid('15'))]]),
      deletedAt: now,
    });

    expect(plan.entries).toHaveLength(3);
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectType: 'FOLDER',
          objectId: child.id,
          originalParentId: parent.id,
        }),
        expect.objectContaining({
          objectType: 'NOTE',
          objectId: note.id,
          originalParentId: child.id,
        }),
      ]),
    );
  });

  it('never allows the root folder to enter trash', () => {
    expect(() =>
      trashFolderTree({
        sourceFolderId: root.id,
        folders: [root, parent, child],
        notes: [note],
        folderTrashEntryIds: new Map(),
        noteTrashEntryIds: new Map(),
        deletedAt: now,
      }),
    ).toThrow(expect.objectContaining({ code: 'ROOT_FOLDER_IMMUTABLE' }));
  });

  it('restores to the original parent or requires an explicit valid target', () => {
    const entry = trashNote({
      note,
      trashEntryId: asTrashEntryId(uuid('16')),
      deletedAt: now,
    }).entries[0];
    const beforeExpiry = asTimestamp(entry.expiresAt - 1);

    expect(
      resolveTrashRestoreTarget({
        entry,
        folders: [root, parent, child],
        trashedObjectIds: new Set(),
        now: beforeExpiry,
      }),
    ).toBe(child.id);

    expect(() =>
      resolveTrashRestoreTarget({
        entry,
        folders: [root, parent],
        trashedObjectIds: new Set([child.id]),
        now: beforeExpiry,
      }),
    ).toThrow(expect.objectContaining({ code: 'TRASH_TARGET_REQUIRED' }));

    expect(
      resolveTrashRestoreTarget({
        entry,
        folders: [root, parent],
        trashedObjectIds: new Set([child.id]),
        explicitTarget: parent,
        now: beforeExpiry,
      }),
    ).toBe(parent.id);
  });

  it('rejects restore exactly at expiry', () => {
    const entry = trashNote({
      note,
      trashEntryId: asTrashEntryId(uuid('17')),
      deletedAt: now,
    }).entries[0];

    expect(() =>
      resolveTrashRestoreTarget({
        entry,
        folders: [root, parent, child],
        trashedObjectIds: new Set(),
        now: entry.expiresAt,
      }),
    ).toThrow(expect.objectContaining({ code: 'TRASH_ENTRY_EXPIRED' }));
  });

  it('rejects restoring a folder beneath its own descendant', () => {
    const plan = trashFolderTree({
      sourceFolderId: parent.id,
      folders: [root, parent, child],
      notes: [note],
      folderTrashEntryIds: new Map([
        [parent.id, asTrashEntryId(uuid('19'))],
        [child.id, asTrashEntryId(uuid('20'))],
      ]),
      noteTrashEntryIds: new Map([[note.id, asTrashEntryId(uuid('21'))]]),
      deletedAt: now,
    });
    const parentEntry = plan.entries.find(
      (entry) => entry.objectId === parent.id,
    );
    if (!parentEntry) throw new Error('Expected parent trash entry');

    expect(() =>
      resolveTrashRestoreTarget({
        entry: parentEntry,
        folders: [parent, child],
        trashedObjectIds: new Set([parent.id]),
        explicitTarget: child,
        now: asTimestamp(parentEntry.expiresAt - 1),
      }),
    ).toThrow(expect.objectContaining({ code: 'FOLDER_CYCLE' }));
  });
});
