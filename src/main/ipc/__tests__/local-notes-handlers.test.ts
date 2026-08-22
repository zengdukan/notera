import { ApplicationError, type LocalNotesService } from '@notera/application';

import { requestContracts } from '../../../shared';
import {
  createLocalNotesBindings,
  type SessionCommandGate,
} from '../local-notes-handlers';

const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const folderId = uuid(1);
const targetFolderId = uuid(2);
const noteId = uuid(3);
const tagId = uuid(4);
const versionId = uuid(5);
const trashEntryId = uuid(6);
const document = { type: 'doc' as const, version: 1 as const };
const folder = {
  kind: 'folder' as const,
  id: folderId,
  name: 'Folder',
  parentId: targetFolderId,
  updatedAt: 1,
  hasChildren: false,
};
const note = {
  kind: 'note' as const,
  id: noteId,
  title: 'Note',
  folderId,
  contentVersion: 1,
  updatedAt: 1,
};
const tag = { id: tagId, name: 'Tag', updatedAt: 1 };
const noteDetail = { ...note, document, createdAt: 1, tags: [tag] };
const favorite = { ...note, favoriteSortOrder: 0 };
const history = {
  versionId,
  noteId,
  displayTitle: 'Version',
  createdAt: 1,
  kind: 'USER' as const,
  protectionReason: null,
  versionName: null,
};
const snapshot = {
  ref: { source: 'VERSION' as const, versionId },
  noteId,
  title: 'Version',
  document,
  createdAt: 1,
};
const trashItem = {
  kind: 'note' as const,
  trashEntryId,
  objectId: noteId,
  displayName: 'Note',
  deletedAt: 1,
  expiresAt: 2,
  originalParentAvailable: true,
};
const searchResult = {
  noteId,
  title: 'Note',
  excerpt: 'Excerpt',
  updatedAt: 1,
  highlights: [],
};

const noArgument = Symbol('no-argument');

interface MappingCase {
  readonly key: keyof typeof requestContracts;
  readonly method: keyof LocalNotesService;
  readonly request: Record<string, unknown>;
  readonly applicationArgument: unknown | typeof noArgument;
  readonly applicationResult: unknown;
  readonly expectedResult: unknown;
}

const cases: readonly MappingCase[] = [
  {
    key: 'contentTree.listChildren',
    method: 'listChildren',
    request: { parentFolderId: folderId, limit: 10 },
    applicationArgument: { parentFolderId: folderId, limit: 10 },
    applicationResult: { items: [folder] },
    expectedResult: { items: [folder] },
  },
  {
    key: 'contentTree.createFolder',
    method: 'createFolder',
    request: { parentFolderId: folderId, name: 'Folder' },
    applicationArgument: { parentFolderId: folderId, name: 'Folder' },
    applicationResult: folder,
    expectedResult: folder,
  },
  {
    key: 'contentTree.renameFolder',
    method: 'renameFolder',
    request: { folderId, name: 'Folder' },
    applicationArgument: { folderId, name: 'Folder' },
    applicationResult: folder,
    expectedResult: folder,
  },
  {
    key: 'contentTree.moveFolder',
    method: 'moveFolder',
    request: { folderId, targetParentId: targetFolderId },
    applicationArgument: { folderId, targetParentId: targetFolderId },
    applicationResult: folder,
    expectedResult: folder,
  },
  {
    key: 'contentTree.trashFolder',
    method: 'trashFolder',
    request: { folderId },
    applicationArgument: folderId,
    applicationResult: { trashEntryId },
    expectedResult: { trashEntryId },
  },
  {
    key: 'note.create',
    method: 'createNote',
    request: { folderId, title: 'Note' },
    applicationArgument: { folderId, title: 'Note' },
    applicationResult: noteDetail,
    expectedResult: noteDetail,
  },
  {
    key: 'note.get',
    method: 'getNote',
    request: { noteId },
    applicationArgument: noteId,
    applicationResult: noteDetail,
    expectedResult: noteDetail,
  },
  {
    key: 'note.saveDraft',
    method: 'saveDraft',
    request: {
      noteId,
      expectedContentVersion: 1,
      title: 'Note',
      document,
    },
    applicationArgument: {
      noteId,
      expectedContentVersion: 1,
      title: 'Note',
      document,
    },
    applicationResult: { noteId, contentVersion: 2, savedAt: 2 },
    expectedResult: { noteId, contentVersion: 2, savedAt: 2 },
  },
  {
    key: 'note.move',
    method: 'moveNote',
    request: { noteId, targetFolderId },
    applicationArgument: { noteId, targetFolderId },
    applicationResult: note,
    expectedResult: note,
  },
  {
    key: 'note.copy',
    method: 'copyNote',
    request: { noteId, targetFolderId },
    applicationArgument: { noteId, targetFolderId },
    applicationResult: note,
    expectedResult: note,
  },
  {
    key: 'note.trash',
    method: 'trashNote',
    request: { noteId },
    applicationArgument: noteId,
    applicationResult: { trashEntryId },
    expectedResult: { trashEntryId },
  },
  {
    key: 'note.listRecent',
    method: 'listRecent',
    request: { limit: 10 },
    applicationArgument: { limit: 10 },
    applicationResult: { items: [note] },
    expectedResult: { items: [note] },
  },
  {
    key: 'tag.list',
    method: 'listTags',
    request: { limit: 10 },
    applicationArgument: { limit: 10 },
    applicationResult: { items: [tag] },
    expectedResult: { items: [tag] },
  },
  {
    key: 'tag.create',
    method: 'createTag',
    request: { name: 'Tag' },
    applicationArgument: 'Tag',
    applicationResult: tag,
    expectedResult: tag,
  },
  {
    key: 'tag.rename',
    method: 'renameTag',
    request: { tagId, name: 'Tag' },
    applicationArgument: { tagId, name: 'Tag' },
    applicationResult: tag,
    expectedResult: tag,
  },
  {
    key: 'tag.delete',
    method: 'deleteTag',
    request: { tagId },
    applicationArgument: tagId,
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'tag.addToNote',
    method: 'addTagToNote',
    request: { noteId, tagId },
    applicationArgument: { noteId, tagId },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'tag.removeFromNote',
    method: 'removeTagFromNote',
    request: { noteId, tagId },
    applicationArgument: { noteId, tagId },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'favorite.list',
    method: 'listFavorites',
    request: { limit: 10 },
    applicationArgument: { limit: 10 },
    applicationResult: { items: [favorite] },
    expectedResult: { items: [favorite] },
  },
  {
    key: 'favorite.add',
    method: 'addFavorite',
    request: { noteId },
    applicationArgument: noteId,
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'favorite.remove',
    method: 'removeFavorite',
    request: { noteId },
    applicationArgument: noteId,
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'favorite.reorder',
    method: 'reorderFavorite',
    request: { noteId, beforeNoteId: uuid(7) },
    applicationArgument: { noteId, beforeNoteId: uuid(7) },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'batch.move',
    method: 'batchMove',
    request: { targets: [{ kind: 'note', id: noteId }], targetFolderId },
    applicationArgument: {
      targets: [{ kind: 'note', id: noteId }],
      targetFolderId,
    },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'batch.addTags',
    method: 'batchAddTags',
    request: { noteIds: [noteId], tagIds: [tagId] },
    applicationArgument: { noteIds: [noteId], tagIds: [tagId] },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'batch.removeTags',
    method: 'batchRemoveTags',
    request: { noteIds: [noteId], tagIds: [tagId] },
    applicationArgument: { noteIds: [noteId], tagIds: [tagId] },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'batch.copy',
    method: 'batchCopy',
    request: { targets: [{ kind: 'note', id: noteId }], targetFolderId },
    applicationArgument: {
      targets: [{ kind: 'note', id: noteId }],
      targetFolderId,
    },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'batch.trash',
    method: 'batchTrash',
    request: { targets: [{ kind: 'note', id: noteId }] },
    applicationArgument: { targets: [{ kind: 'note', id: noteId }] },
    applicationResult: { trashEntryIds: [trashEntryId] },
    expectedResult: { trashEntryIds: [trashEntryId] },
  },
  {
    key: 'history.list',
    method: 'listHistory',
    request: { noteId, limit: 10 },
    applicationArgument: { noteId, limit: 10 },
    applicationResult: { items: [history] },
    expectedResult: { items: [history] },
  },
  {
    key: 'history.get',
    method: 'getHistory',
    request: { noteId, versionId },
    applicationArgument: { noteId, versionId },
    applicationResult: snapshot,
    expectedResult: snapshot,
  },
  {
    key: 'history.createPermanent',
    method: 'createPermanentVersion',
    request: { noteId, versionName: 'Version' },
    applicationArgument: { noteId, versionName: 'Version' },
    applicationResult: { ...history, versionName: 'Version' },
    expectedResult: { ...history, versionName: 'Version' },
  },
  {
    key: 'history.rename',
    method: 'renameHistoryVersion',
    request: { noteId, versionId, versionName: null },
    applicationArgument: { noteId, versionId, versionName: null },
    applicationResult: history,
    expectedResult: history,
  },
  {
    key: 'history.compare',
    method: 'compareHistory',
    request: {
      noteId,
      left: { source: 'CURRENT' },
      right: { source: 'VERSION', versionId },
    },
    applicationArgument: {
      noteId,
      left: { source: 'CURRENT' },
      right: { source: 'VERSION', versionId },
    },
    applicationResult: {
      left: { ...snapshot, ref: { source: 'CURRENT' } },
      right: snapshot,
    },
    expectedResult: {
      left: { ...snapshot, ref: { source: 'CURRENT' } },
      right: snapshot,
    },
  },
  {
    key: 'history.restore',
    method: 'restoreHistory',
    request: { noteId, versionId, expectedContentVersion: 1 },
    applicationArgument: { noteId, versionId, expectedContentVersion: 1 },
    applicationResult: {
      noteId,
      contentVersion: 2,
      protectionVersionId: uuid(8),
    },
    expectedResult: {
      noteId,
      contentVersion: 2,
      protectionVersionId: uuid(8),
    },
  },
  {
    key: 'history.copy',
    method: 'copyHistory',
    request: { noteId, versionId, targetFolderId },
    applicationArgument: { noteId, versionId, targetFolderId },
    applicationResult: note,
    expectedResult: note,
  },
  {
    key: 'trash.list',
    method: 'listTrash',
    request: { limit: 10 },
    applicationArgument: { limit: 10 },
    applicationResult: { items: [trashItem] },
    expectedResult: { items: [trashItem] },
  },
  {
    key: 'trash.restore',
    method: 'restoreTrash',
    request: { trashEntryId, targetFolderId },
    applicationArgument: { trashEntryId, targetFolderId },
    applicationResult: undefined,
    expectedResult: {},
  },
  {
    key: 'trash.deletePermanent',
    method: 'deleteTrashPermanent',
    request: { trashEntryId },
    applicationArgument: trashEntryId,
    applicationResult: { deletedCount: 1 },
    expectedResult: { deletedCount: 1 },
  },
  {
    key: 'trash.purgeExpired',
    method: 'purgeExpiredTrash',
    request: {},
    applicationArgument: noArgument,
    applicationResult: { deletedCount: 1 },
    expectedResult: { deletedCount: 1 },
  },
  {
    key: 'search.query',
    method: 'search',
    request: { query: 'Note', limit: 10 },
    applicationArgument: { query: 'Note', limit: 10 },
    applicationResult: { items: [searchResult] },
    expectedResult: { items: [searchResult] },
  },
];

const openGate: SessionCommandGate = {
  run: (operation) => Promise.resolve().then(operation),
};

function serviceFor(
  expectedMethod: keyof LocalNotesService,
  result: unknown,
  calls: { method: PropertyKey; arguments: readonly unknown[] }[],
): LocalNotesService {
  return new Proxy({} as LocalNotesService, {
    get:
      (_target, method) =>
      (...args: readonly unknown[]) => {
        if (method !== expectedMethod) {
          throw new Error(`Unexpected Application method: ${String(method)}`);
        }
        calls.push({ method, arguments: args });
        return Promise.resolve(result);
      },
  });
}

describe('local note IPC handlers', () => {
  it('binds exactly the 39 local note and organization requests', () => {
    const bindings = createLocalNotesBindings({
      service: serviceFor('getNote', noteDetail, []),
      gate: openGate,
    });

    expect(bindings.map((binding) => binding.key)).toEqual(
      cases.map((value) => value.key),
    );
    expect(new Set(bindings.map((binding) => binding.key)).size).toBe(39);
  });

  test.each(cases)(
    '$key calls $method with the intended DTO mapping',
    async (value) => {
      const calls: { method: PropertyKey; arguments: readonly unknown[] }[] =
        [];
      const bindings = createLocalNotesBindings({
        service: serviceFor(value.method, value.applicationResult, calls),
        gate: openGate,
      });
      const binding = bindings.find((candidate) => candidate.key === value.key);

      await expect(binding?.invoke(value.request)).resolves.toEqual(
        value.expectedResult,
      );
      expect(calls).toEqual([
        {
          method: value.method,
          arguments:
            value.applicationArgument === noArgument
              ? []
              : [value.applicationArgument],
        },
      ]);
      expect(
        requestContracts[value.key].data.safeParse(value.expectedResult)
          .success,
      ).toBe(true);
    },
  );

  it('does not call Application when the Session Gate rejects', async () => {
    const calls: { method: PropertyKey; arguments: readonly unknown[] }[] = [];
    const bindings = createLocalNotesBindings({
      service: serviceFor('getNote', noteDetail, calls),
      gate: {
        run: () => Promise.reject(new ApplicationError('PROFILE_LOCKED')),
      },
    });
    const binding = bindings.find((candidate) => candidate.key === 'note.get');

    await expect(binding?.invoke({ noteId })).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    expect(calls).toEqual([]);
  });
});
