import type { LocalNotesService } from '@notera/application';

import { defineIpcBinding, type IpcBinding } from './router';

export interface SessionCommandGate {
  run<Result>(operation: () => Promise<Result> | Result): Promise<Result>;
}

type MethodInput<Method extends keyof LocalNotesService> = Parameters<
  LocalNotesService[Method]
>[0];

function asInput<Method extends keyof LocalNotesService>(
  value: unknown,
): MethodInput<Method> {
  return value as MethodInput<Method>;
}

function emptyResult(
  gate: SessionCommandGate,
  operation: () => Promise<void>,
): Promise<Record<string, never>> {
  return gate.run(async () => {
    await operation();
    return {};
  });
}

export function createLocalNotesBindings(input: {
  readonly service: LocalNotesService;
  readonly gate: SessionCommandGate;
}): readonly IpcBinding[] {
  const { service, gate } = input;
  return Object.freeze([
    defineIpcBinding('contentTree.listChildren', (value) =>
      gate.run(() => service.listChildren(asInput<'listChildren'>(value))),
    ),
    defineIpcBinding('contentTree.getFolderPath', (value) =>
      gate.run(() => service.getFolderPath(asInput<'getFolderPath'>(value.folderId))),
    ),
    defineIpcBinding('contentTree.createFolder', (value) =>
      gate.run(() => service.createFolder(asInput<'createFolder'>(value))),
    ),
    defineIpcBinding('contentTree.renameFolder', (value) =>
      gate.run(() => service.renameFolder(asInput<'renameFolder'>(value))),
    ),
    defineIpcBinding('contentTree.moveFolder', (value) =>
      gate.run(() => service.moveFolder(asInput<'moveFolder'>(value))),
    ),
    defineIpcBinding('contentTree.trashFolder', (value) =>
      gate.run(() =>
        service.trashFolder(asInput<'trashFolder'>(value.folderId)),
      ),
    ),
    defineIpcBinding('note.create', (value) =>
      gate.run(() => service.createNote(asInput<'createNote'>(value))),
    ),
    defineIpcBinding('note.get', (value) =>
      gate.run(() => service.getNote(asInput<'getNote'>(value.noteId))),
    ),
    defineIpcBinding('note.rename', (value) =>
      gate.run(() => service.renameNote(asInput<'renameNote'>(value))),
    ),
    defineIpcBinding('note.saveDraft', (value) =>
      gate.run(() => service.saveDraft(asInput<'saveDraft'>(value))),
    ),
    defineIpcBinding('note.move', (value) =>
      gate.run(() => service.moveNote(asInput<'moveNote'>(value))),
    ),
    defineIpcBinding('note.copy', (value) =>
      gate.run(() => service.copyNote(asInput<'copyNote'>(value))),
    ),
    defineIpcBinding('note.trash', (value) =>
      gate.run(() => service.trashNote(asInput<'trashNote'>(value.noteId))),
    ),
    defineIpcBinding('note.listRecent', (value) =>
      gate.run(() => service.listRecent(asInput<'listRecent'>(value))),
    ),
    defineIpcBinding('tag.list', (value) =>
      gate.run(() => service.listTags(asInput<'listTags'>(value))),
    ),
    defineIpcBinding('tag.create', (value) =>
      gate.run(() => service.createTag(asInput<'createTag'>(value.name))),
    ),
    defineIpcBinding('tag.rename', (value) =>
      gate.run(() => service.renameTag(asInput<'renameTag'>(value))),
    ),
    defineIpcBinding('tag.delete', (value) =>
      emptyResult(gate, () =>
        service.deleteTag(asInput<'deleteTag'>(value.tagId)),
      ),
    ),
    defineIpcBinding('tag.addToNote', (value) =>
      emptyResult(gate, () =>
        service.addTagToNote(asInput<'addTagToNote'>(value)),
      ),
    ),
    defineIpcBinding('tag.removeFromNote', (value) =>
      emptyResult(gate, () =>
        service.removeTagFromNote(asInput<'removeTagFromNote'>(value)),
      ),
    ),
    defineIpcBinding('favorite.list', (value) =>
      gate.run(() => service.listFavorites(asInput<'listFavorites'>(value))),
    ),
    defineIpcBinding('favorite.add', (value) =>
      emptyResult(gate, () =>
        service.addFavorite(asInput<'addFavorite'>(value.noteId)),
      ),
    ),
    defineIpcBinding('favorite.remove', (value) =>
      emptyResult(gate, () =>
        service.removeFavorite(asInput<'removeFavorite'>(value.noteId)),
      ),
    ),
    defineIpcBinding('favorite.reorder', (value) =>
      emptyResult(gate, () =>
        service.reorderFavorite(asInput<'reorderFavorite'>(value)),
      ),
    ),
    defineIpcBinding('batch.move', (value) =>
      emptyResult(gate, () => service.batchMove(asInput<'batchMove'>(value))),
    ),
    defineIpcBinding('batch.addTags', (value) =>
      emptyResult(gate, () =>
        service.batchAddTags(asInput<'batchAddTags'>(value)),
      ),
    ),
    defineIpcBinding('batch.removeTags', (value) =>
      emptyResult(gate, () =>
        service.batchRemoveTags(asInput<'batchRemoveTags'>(value)),
      ),
    ),
    defineIpcBinding('batch.copy', (value) =>
      emptyResult(gate, () => service.batchCopy(asInput<'batchCopy'>(value))),
    ),
    defineIpcBinding('batch.trash', (value) =>
      gate.run(() => service.batchTrash(asInput<'batchTrash'>(value))),
    ),
    defineIpcBinding('history.list', (value) =>
      gate.run(() => service.listHistory(asInput<'listHistory'>(value))),
    ),
    defineIpcBinding('history.get', (value) =>
      gate.run(() => service.getHistory(asInput<'getHistory'>(value))),
    ),
    defineIpcBinding('history.createPermanent', (value) =>
      gate.run(() =>
        service.createPermanentVersion(
          asInput<'createPermanentVersion'>(value),
        ),
      ),
    ),
    defineIpcBinding('history.rename', (value) =>
      gate.run(() =>
        service.renameHistoryVersion(asInput<'renameHistoryVersion'>(value)),
      ),
    ),
    defineIpcBinding('history.compare', (value) =>
      gate.run(() => service.compareHistory(asInput<'compareHistory'>(value))),
    ),
    defineIpcBinding('history.restore', (value) =>
      gate.run(() => service.restoreHistory(asInput<'restoreHistory'>(value))),
    ),
    defineIpcBinding('history.copy', (value) =>
      gate.run(() => service.copyHistory(asInput<'copyHistory'>(value))),
    ),
    defineIpcBinding('trash.list', (value) =>
      gate.run(() => service.listTrash(asInput<'listTrash'>(value))),
    ),
    defineIpcBinding('trash.restore', (value) =>
      emptyResult(gate, () =>
        service.restoreTrash(asInput<'restoreTrash'>(value)),
      ),
    ),
    defineIpcBinding('trash.deletePermanent', (value) =>
      gate.run(() =>
        service.deleteTrashPermanent(
          asInput<'deleteTrashPermanent'>(value.trashEntryId),
        ),
      ),
    ),
    defineIpcBinding('trash.purgeExpired', () =>
      gate.run(() => service.purgeExpiredTrash()),
    ),
    defineIpcBinding('search.query', (value) =>
      gate.run(() => service.search(asInput<'search'>(value))),
    ),
  ]);
}
