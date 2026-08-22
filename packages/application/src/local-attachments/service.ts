import { randomUUID } from 'node:crypto';

import { asTimestamp, type Timestamp } from '@notera/domain';

import { ApplicationError } from '../errors';
import type { ProfileSession } from '../session';
import type {
  ImportAttachmentInput,
  ListAttachmentsForNoteInput,
  LocalAttachmentsService,
} from './types';
import { importAttachment } from './import';
import { attachmentSummary } from './mapping';
import { mapReadError } from './errors';
import { openAttachmentReader } from './reader';
import { requireActiveNote, validateListInput } from './validation';

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

  openReader(attachmentId: Parameters<LocalAttachmentsService['openReader']>[0]) {
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
        now: this.now,
      }),
    );
  }
}

export function createLocalAttachmentsService(
  dependencies: LocalAttachmentsDependencies,
): LocalAttachmentsService {
  return new SessionLocalAttachmentsService(dependencies);
}
