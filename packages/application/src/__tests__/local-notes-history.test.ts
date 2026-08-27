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
      title: 'Old title',
      document: historicalDocument,
    });
    const tag = await localNotes.createTag('current');
    await localNotes.addTagToNote({ noteId: note.id, tagId: tag.id });
    const historicalAttachment =
      await manager.localAttachments.importAttachment({
        noteId: note.id,
        fileName: 'historical.txt',
        mimeType: 'text/plain',
        source: (async function* attachmentSource() {
          yield new Uint8Array([1]);
        })(),
      });

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
    const currentAttachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'current.txt',
      mimeType: 'text/plain',
      source: (async function* attachmentSource() {
        yield new Uint8Array([2]);
      })(),
    });

    const changed = await localNotes.saveDraft({
      noteId: note.id,
      title: 'Current title',
      document: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'media', attrs: { id: historicalAttachment.id } },
          { type: 'media', attrs: { id: currentAttachment.id } },
        ],
      },
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
    await expect(
      manager.localAttachments.listForNote({ noteId: note.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: historicalAttachment.id })],
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
      manager.localAttachments.listForNote({ noteId: copied.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: historicalAttachment.id })],
    });
    const protectionCopy = await localNotes.copyHistory({
      noteId: note.id,
      versionId: restored.protectionVersionId,
      targetFolderId: profile.rootFolderId,
    });
    expect(
      (
        await manager.localAttachments.listForNote({
          noteId: protectionCopy.id,
          limit: 10,
        })
      ).items.map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([historicalAttachment.id, currentAttachment.id]),
    );
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
