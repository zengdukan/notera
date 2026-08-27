import { randomUUID } from 'node:crypto';

import { asTimestamp, type Timestamp } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { ProfileSession, SessionResources } from '../session';
import { collectBlobIds } from '../local-attachments/gc';
import {
  batchAddTags,
  batchCopy,
  batchMove,
  batchRemoveTags,
  batchTrash,
} from './batch';
import {
  createFolder,
  getFolderPath,
  listChildren,
  moveFolder,
  renameFolder,
} from './folders';
import mapLocalNotesError from './errors';
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  reorderFavorite,
} from './favorites';
import {
  copyNote,
  createNote,
  getNote,
  listRecent,
  moveNote,
  renameNote,
  saveDraft,
  trashNote,
} from './notes';
import search from './search';
import {
  compareHistory,
  copyHistory,
  createPermanentVersion,
  getHistory,
  listHistory,
  renameHistoryVersion,
  restoreHistory,
} from './history';
import {
  addTagToNote,
  createTag,
  deleteTag,
  listTags,
  removeTagFromNote,
  renameTag,
} from './tags';
import {
  deleteTrashPermanent,
  listTrash,
  purgeExpiredTrash,
  restoreTrash,
  trashFolder,
} from './trash';
import type {
  FolderSummary,
  ListChildrenInput,
  LocalNotesService,
} from './types';

export interface LocalNotesDependencies {
  readonly getSession: () => ProfileSession | undefined;
  readonly now?: () => Timestamp;
  readonly randomId?: () => string;
}

class SessionLocalNotesService implements LocalNotesService {
  private readonly now: () => Timestamp;

  private readonly randomId: () => string;

  constructor(private readonly dependencies: LocalNotesDependencies) {
    this.now = dependencies.now ?? (() => asTimestamp(Date.now()));
    this.randomId = dependencies.randomId ?? randomUUID;
  }

  private run<Result>(
    mode: 'READ' | 'WRITE',
    operation: (database: VaultDatabase) => Result,
  ): Promise<Result> {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session
      .run(({ database }) => operation(database))
      .catch((error) => {
        throw mapLocalNotesError(error, mode);
      });
  }

  private runResources<Result>(
    mode: 'READ' | 'WRITE',
    operation: (resources: SessionResources) => Promise<Result> | Result,
  ): Promise<Result> {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session.run(operation).catch((error) => {
      throw mapLocalNotesError(error, mode);
    });
  }

  listChildren(input: ListChildrenInput) {
    return this.run('READ', (database) => listChildren(database, input));
  }

  getFolderPath(folderId: Parameters<LocalNotesService['getFolderPath']>[0]) {
    return this.run('READ', (database) => getFolderPath(database, folderId));
  }

  createFolder(input: {
    readonly parentFolderId: Parameters<
      LocalNotesService['createFolder']
    >[0]['parentFolderId'];
    readonly name: string;
  }): Promise<FolderSummary> {
    return this.run('WRITE', (database) =>
      createFolder(database, input, this.randomId(), this.now()),
    );
  }

  renameFolder(input: Parameters<LocalNotesService['renameFolder']>[0]) {
    return this.run('WRITE', (database) =>
      renameFolder(database, input, this.now()),
    );
  }

  moveFolder(input: Parameters<LocalNotesService['moveFolder']>[0]) {
    return this.run('WRITE', (database) =>
      moveFolder(database, input, this.now()),
    );
  }

  trashFolder(folderId: Parameters<LocalNotesService['trashFolder']>[0]) {
    return this.run('WRITE', (database) =>
      trashFolder(database, folderId, this.randomId, this.now()),
    );
  }

  createNote(input: Parameters<LocalNotesService['createNote']>[0]) {
    return this.run('WRITE', (database) =>
      createNote(database, input, this.randomId(), this.now()),
    );
  }

  getNote(noteId: Parameters<LocalNotesService['getNote']>[0]) {
    return this.run('READ', (database) => getNote(database, noteId));
  }

  renameNote(input: Parameters<LocalNotesService['renameNote']>[0]) {
    return this.run('WRITE', (database) =>
      renameNote(database, input, this.now()),
    );
  }

  saveDraft(input: Parameters<LocalNotesService['saveDraft']>[0]) {
    return this.run('WRITE', (database) =>
      saveDraft(database, input, this.now()),
    );
  }

  moveNote(input: Parameters<LocalNotesService['moveNote']>[0]) {
    return this.run('WRITE', (database) =>
      moveNote(database, input, this.now()),
    );
  }

  copyNote(input: Parameters<LocalNotesService['copyNote']>[0]) {
    return this.run('WRITE', (database) =>
      copyNote(database, input, this.randomId(), this.now()),
    );
  }

  trashNote(noteId: Parameters<LocalNotesService['trashNote']>[0]) {
    return this.run('WRITE', (database) =>
      trashNote(database, noteId, this.randomId(), this.now()),
    );
  }

  listRecent(input: Parameters<LocalNotesService['listRecent']>[0]) {
    return this.run('READ', (database) => listRecent(database, input));
  }

  listTags(input: Parameters<LocalNotesService['listTags']>[0]) {
    return this.run('READ', (database) => listTags(database, input));
  }

  createTag(name: Parameters<LocalNotesService['createTag']>[0]) {
    return this.run('WRITE', (database) =>
      createTag(database, name, this.randomId(), this.now()),
    );
  }

  renameTag(input: Parameters<LocalNotesService['renameTag']>[0]) {
    return this.run('WRITE', (database) =>
      renameTag(database, input, this.now()),
    );
  }

  deleteTag(tagId: Parameters<LocalNotesService['deleteTag']>[0]) {
    return this.run('WRITE', (database) => deleteTag(database, tagId));
  }

  addTagToNote(input: Parameters<LocalNotesService['addTagToNote']>[0]) {
    return this.run('WRITE', (database) => addTagToNote(database, input));
  }

  removeTagFromNote(
    input: Parameters<LocalNotesService['removeTagFromNote']>[0],
  ) {
    return this.run('WRITE', (database) => removeTagFromNote(database, input));
  }

  listFavorites(input: Parameters<LocalNotesService['listFavorites']>[0]) {
    return this.run('READ', (database) => listFavorites(database, input));
  }

  addFavorite(noteId: Parameters<LocalNotesService['addFavorite']>[0]) {
    return this.run('WRITE', (database) =>
      addFavorite(database, noteId, this.now()),
    );
  }

  removeFavorite(noteId: Parameters<LocalNotesService['removeFavorite']>[0]) {
    return this.run('WRITE', (database) => removeFavorite(database, noteId));
  }

  reorderFavorite(input: Parameters<LocalNotesService['reorderFavorite']>[0]) {
    return this.run('WRITE', (database) => reorderFavorite(database, input));
  }

  listHistory(input: Parameters<LocalNotesService['listHistory']>[0]) {
    return this.run('READ', (database) => listHistory(database, input));
  }

  getHistory(input: Parameters<LocalNotesService['getHistory']>[0]) {
    return this.run('READ', (database) => getHistory(database, input));
  }

  createPermanentVersion(
    input: Parameters<LocalNotesService['createPermanentVersion']>[0],
  ) {
    return this.run('WRITE', (database) =>
      createPermanentVersion(database, input, this.randomId(), this.now()),
    );
  }

  renameHistoryVersion(
    input: Parameters<LocalNotesService['renameHistoryVersion']>[0],
  ) {
    return this.run('WRITE', (database) =>
      renameHistoryVersion(database, input),
    );
  }

  compareHistory(input: Parameters<LocalNotesService['compareHistory']>[0]) {
    return this.run('READ', (database) => compareHistory(database, input));
  }

  restoreHistory(input: Parameters<LocalNotesService['restoreHistory']>[0]) {
    return this.run('WRITE', (database) =>
      restoreHistory(database, input, this.randomId(), this.now()),
    );
  }

  copyHistory(input: Parameters<LocalNotesService['copyHistory']>[0]) {
    return this.run('WRITE', (database) =>
      copyHistory(database, input, this.randomId(), this.now()),
    );
  }

  listTrash(input: Parameters<LocalNotesService['listTrash']>[0]) {
    return this.run('READ', (database) => listTrash(database, input));
  }

  restoreTrash(input: Parameters<LocalNotesService['restoreTrash']>[0]) {
    return this.run('WRITE', (database) =>
      restoreTrash(database, input, this.now()),
    );
  }

  deleteTrashPermanent(
    trashEntryId: Parameters<LocalNotesService['deleteTrashPermanent']>[0],
  ) {
    return this.runResources('WRITE', async (resources) => {
      const result = deleteTrashPermanent(
        resources.database,
        trashEntryId,
        this.now(),
      );
      await collectBlobIds(resources, result.blobIds);
      return Object.freeze({ deletedCount: result.deletedCount });
    });
  }

  purgeExpiredTrash() {
    return this.runResources('WRITE', async (resources) => {
      const result = purgeExpiredTrash(resources.database, this.now());
      await collectBlobIds(resources, result.blobIds);
      return Object.freeze({ deletedCount: result.deletedCount });
    });
  }

  batchMove(input: Parameters<LocalNotesService['batchMove']>[0]) {
    return this.run('WRITE', (database) =>
      batchMove(database, input, this.now()),
    );
  }

  batchAddTags(input: Parameters<LocalNotesService['batchAddTags']>[0]) {
    return this.run('WRITE', (database) => batchAddTags(database, input));
  }

  batchRemoveTags(input: Parameters<LocalNotesService['batchRemoveTags']>[0]) {
    return this.run('WRITE', (database) => batchRemoveTags(database, input));
  }

  batchCopy(input: Parameters<LocalNotesService['batchCopy']>[0]) {
    return this.run('WRITE', (database) =>
      batchCopy(database, input, this.randomId, this.now()),
    );
  }

  batchTrash(input: Parameters<LocalNotesService['batchTrash']>[0]) {
    return this.run('WRITE', (database) =>
      batchTrash(database, input, this.randomId, this.now()),
    );
  }

  search(input: Parameters<LocalNotesService['search']>[0]) {
    return this.run('READ', (database) => search(database, input));
  }
}

export function createLocalNotesService(
  dependencies: LocalNotesDependencies,
): LocalNotesService {
  return new SessionLocalNotesService(dependencies);
}
