import { randomUUID } from 'node:crypto';

import { asTimestamp, type Timestamp } from '@notera/domain';

import { ApplicationError } from '../errors';
import type { ProfileSession } from '../session';
import type {
  ImportAttachmentInput,
  ListAttachmentsForNoteInput,
  LocalAttachmentsService,
} from './types';
import importAttachment from './import';
import { collectBlobIds, collectGarbage } from './gc';
import attachmentSummary from './mapping';
import { mapReadError } from './errors';
import openAttachmentReader from './reader';
import {
  requireActiveNote,
  validateListInput,
  normalizeAttachmentId,
  normalizeNoteId,
} from './validation';

export interface LocalAttachmentsDependencies {
  readonly getSession: () => ProfileSession | undefined;
  readonly now?: () => Timestamp;
  readonly randomId?: () => string;
}

class SessionLocalAttachmentsService implements LocalAttachmentsService {
  private readonly now: () => Timestamp;

  private readonly randomId: () => string;

  constructor(private readonly dependencies: LocalAttachmentsDependencies) {
    this.now = dependencies.now ?? (() => asTimestamp(Date.now()));
    this.randomId = dependencies.randomId ?? randomUUID;
  }

  importAttachment(input: ImportAttachmentInput) {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session.run((resources) =>
      importAttachment(
        resources,
        session.summary.vaultId,
        input,
        this.now(),
        this.randomId,
      ),
    );
  }

  listForNote(input: ListAttachmentsForNoteInput) {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session
      .run(({ database }) => {
        const pageRequest = validateListInput(input);
        requireActiveNote(database, pageRequest.noteId);
        const page = database.attachments.listForNote(
          pageRequest.noteId,
          pageRequest,
        );
        return Object.freeze({
          items: Object.freeze(
            page.items.map(({ attachment, blob }) =>
              attachmentSummary(attachment, blob),
            ),
          ),
          ...(page.nextCursor === undefined
            ? {}
            : { nextCursor: page.nextCursor }),
        });
      })
      .catch((error) => {
        throw mapReadError(error);
      });
  }

  openReader(
    attachmentId: Parameters<LocalAttachmentsService['openReader']>[0],
    noteId?: Parameters<LocalAttachmentsService['openReader']>[1],
  ) {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session.run((resources) =>
      openAttachmentReader({
        database: resources.database,
        attachments: resources.attachments,
        signal: resources.signal,
        attachmentId,
        noteId,
        now: this.now,
      }),
    );
  }

  removeFromNote(
    input: Parameters<LocalAttachmentsService['removeFromNote']>[0],
  ): Promise<void> {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session.run(async (resources) => {
      const noteId = normalizeNoteId(input?.noteId);
      const attachmentId = normalizeAttachmentId(input?.attachmentId);
      requireActiveNote(resources.database, noteId);
      const blobIds = resources.database.transaction((transaction) => {
        const reference = transaction.attachments
          .listReferencesForAttachments([attachmentId])
          .find((value) => value.source === 'NOTE' && value.noteId === noteId);
        if (reference === undefined) {
          throw new ApplicationError('ENTITY_NOT_FOUND');
        }
        transaction.attachments.removeReferences([reference]);
        return transaction.attachments.deleteUnreferencedAttachments(
          [attachmentId],
          this.now(),
        );
      });
      await collectBlobIds(resources, blobIds);
    });
  }

  collectGarbage() {
    const session = this.dependencies.getSession();
    if (session === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return session.run((resources) => collectGarbage(resources, this.now()));
  }
}

export function createLocalAttachmentsService(
  dependencies: LocalAttachmentsDependencies,
): LocalAttachmentsService {
  return new SessionLocalAttachmentsService(dependencies);
}
