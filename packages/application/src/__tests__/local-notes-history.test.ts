import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

const historicalDocument = {
  type: 'doc' as const,
  version: 1 as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }],
};

afterEach(() => cleanupTempRoots());

describe('LocalNotesService history use cases', () => {
  it('names, compares, restores, and copies permanent history', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const profile = await manager.createProfile({
      displayName: 'History',
      password: 'correct horse battery staple',
    });
    const { localNotes } = manager;
    const note = await localNotes.createNote({
      folderId: profile.rootFolderId,
      title: 'Old title',
    });
    await localNotes.saveDraft({
      noteId: note.id,
      expectedContentVersion: note.contentVersion,
      title: 'Old title',
      document: historicalDocument,
    });
    const tag = await localNotes.createTag('current');
    await localNotes.addTagToNote({ noteId: note.id, tagId: tag.id });

    const permanent = await localNotes.createPermanentVersion({
      noteId: note.id,
      versionName: '  提交前  ',
    });
    expect(permanent).toMatchObject({
      kind: 'USER',
      versionName: '提交前',
      protectionReason: null,
      displayTitle: 'Old title',
    });
    const renamed = await localNotes.renameHistoryVersion({
      noteId: note.id,
      versionId: permanent.versionId,
      versionName: '里程碑',
    });
    expect(renamed.versionName).toBe('里程碑');
    await expect(
      localNotes.renameHistoryVersion({
        noteId: note.id,
        versionId: permanent.versionId,
        versionName: null,
      }),
    ).resolves.toMatchObject({ versionName: null });
    await localNotes.renameHistoryVersion({
      noteId: note.id,
      versionId: permanent.versionId,
      versionName: '里程碑',
    });

    const changed = await localNotes.saveDraft({
      noteId: note.id,
      expectedContentVersion: 2,
      title: 'Current title',
      document: { type: 'doc', version: 1 },
    });
    const comparison = await localNotes.compareHistory({
      noteId: note.id,
      left: { source: 'VERSION', versionId: permanent.versionId },
      right: { source: 'CURRENT' },
    });
    expect(comparison.left).toMatchObject({
      title: 'Old title',
      document: historicalDocument,
    });
    expect(comparison.right.title).toBe('Current title');

    const restored = await localNotes.restoreHistory({
      noteId: note.id,
      versionId: permanent.versionId,
      expectedContentVersion: changed.contentVersion,
    });
    expect(restored).toMatchObject({
      noteId: note.id,
      contentVersion: 4,
      protectionVersionId: expect.any(String),
    });
    const history = await localNotes.listHistory({
      noteId: note.id,
      limit: 10,
    });
    expect(history.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'USER', versionName: '里程碑' }),
        expect.objectContaining({
          kind: 'SYSTEM_PROTECTION',
          protectionReason: 'BEFORE_HISTORY_RESTORE',
          versionName: null,
        }),
      ]),
    );
    await expect(
      localNotes.renameHistoryVersion({
        noteId: note.id,
        versionId: restored.protectionVersionId,
        versionName: 'forbidden',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ENTITY_STATE' });

    const copied = await localNotes.copyHistory({
      noteId: note.id,
      versionId: permanent.versionId,
      targetFolderId: profile.rootFolderId,
    });
    await expect(localNotes.getNote(copied.id)).resolves.toMatchObject({
      title: 'Old title',
      document: historicalDocument,
      tags: [],
    });
    await expect(
      localNotes.restoreHistory({
        noteId: note.id,
        versionId: permanent.versionId,
        expectedContentVersion: changed.contentVersion,
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_VERSION_CONFLICT' });

    await manager.close();
  }, 60_000);
});
