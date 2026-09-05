import type { ProfileManager } from '@notera/application';

import { startMediaAdapterServer } from './server';
import type { IpcDiagnosticLogger } from '../ipc/router';

export function startElectronMediaAdapter(input: {
  readonly manager: ProfileManager;
  readonly allowedOrigin: string;
  readonly randomBytes: () => Uint8Array;
  readonly randomUUID: () => string;
  readonly now: () => number;
  readonly logger?: IpcDiagnosticLogger;
}) {
  return startMediaAdapterServer({
    allowedOrigin: input.allowedOrigin,
    getSessionState: () => input.manager.getSessionState(),
    notes: {
      getNote: (noteId) => input.manager.localNotes.getNote(noteId as never),
    },
    attachments: {
      importAttachment: (value) =>
        input.manager.localAttachments.importAttachment(value),
      openReader: (attachmentId, noteId) =>
        input.manager.localAttachments.openReader(
          attachmentId as never,
          noteId as never,
        ),
    },
    randomBytes: input.randomBytes,
    randomUUID: input.randomUUID,
    now: input.now,
    logger: input.logger,
  });
}
