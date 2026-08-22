import { randomUUID } from 'node:crypto';

import { asTimestamp, type Timestamp } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { ProfileSession } from '../session';
import {
  createFolder,
  listChildren,
  moveFolder,
  renameFolder,
} from './folders';
import { mapLocalNotesError } from './errors';
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
      .catch((error) => Promise.reject(mapLocalNotesError(error, mode)));
  }

  listChildren(input: ListChildrenInput) {
    return this.run('READ', (database) => listChildren(database, input));
  }

  createFolder(input: {
    readonly parentFolderId: Parameters<LocalNotesService['createFolder']>[0]['parentFolderId'];
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
}

export function createLocalNotesService(
  dependencies: LocalNotesDependencies,
): LocalNotesService {
  return new SessionLocalNotesService(dependencies);
}
