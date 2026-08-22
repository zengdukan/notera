import type { LocalAttachmentsService } from '@notera/application';

import { requestContracts } from '../../shared';
import type { AttachmentFileAccess } from '../attachments/file-access';
import { OperationRegistry } from '../operations/registry';
import type { SessionCommandGate } from './local-notes-handlers';
import { MainIpcError, toIpcError } from './errors';
import { defineIpcBinding, type IpcBinding } from './router';

export interface AttachmentHandlerDependencies {
  readonly service: LocalAttachmentsService;
  readonly files: AttachmentFileAccess;
  readonly operations: OperationRegistry;
  readonly gate: SessionCommandGate;
  readonly now: () => number;
}

function progress(completed: number, total: number): number | null {
  if (total === 0) return null;
  return Math.min(1, Math.max(0, completed / total));
}

function operationNotFound(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENTITY_NOT_FOUND'
  ) {
    throw new MainIpcError('OPERATION_NOT_FOUND');
  }
  throw error;
}

export function createAttachmentBindings(
  input: AttachmentHandlerDependencies,
): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('attachment.listForNote', (value) =>
      input.gate.run(() =>
        input.service.listForNote(
          value as Parameters<LocalAttachmentsService['listForNote']>[0],
        ),
      ),
    ),
    defineIpcBinding('attachment.startImport', (value) =>
      input.gate.run(async () => {
        const selection = await input.files.chooseImport();
        if (selection === null) return { status: 'cancelled' as const };
        const operationId = input.operations.start({
          kind: 'ATTACHMENT_IMPORT',
          execute: async (context) => {
            const source = selection.open({
              signal: context.signal,
              onBytes: (completed) =>
                context.progress(
                  'READING',
                  progress(completed, selection.byteLength),
                ),
            });
            const attachment = await input.service.importAttachment({
              noteId: value.noteId as never,
              fileName: selection.fileName,
              mimeType: selection.mimeType,
              source,
              signal: context.signal,
            });
            context.progress('FINALIZING', 1);
            return { attachment };
          },
          mapError: (error) =>
            toIpcError(requestContracts['attachment.startImport'], error),
        });
        return { status: 'started' as const, operationId };
      }),
    ),
    defineIpcBinding('attachment.removeFromNote', (value) =>
      input.gate.run(async () => {
        await input.service.removeFromNote(
          value as Parameters<LocalAttachmentsService['removeFromNote']>[0],
        );
        return {};
      }),
    ),
    defineIpcBinding('attachment.startSaveAs', (value) =>
      input.gate.run(async () => {
        const selection = await input.files.chooseSave();
        if (selection === null) return { status: 'cancelled' as const };
        const operationId = input.operations.start({
          kind: 'ATTACHMENT_SAVE_AS',
          execute: async (context) => {
            const reader = await input.service.openReader(
              value.attachmentId as never,
            );
            try {
              await selection.write({
                source: reader.stream(),
                byteLength: reader.byteLength,
                signal: context.signal,
                onBytes: (completed) =>
                  context.progress(
                    'WRITING',
                    progress(completed, reader.byteLength),
                  ),
              });
              context.progress('FINALIZING', 1);
              return { completedAt: input.now() };
            } finally {
              await reader.close();
            }
          },
          mapError: (error) =>
            toIpcError(requestContracts['attachment.startSaveAs'], error),
        });
        return { status: 'started' as const, operationId };
      }),
    ),
    defineIpcBinding('operation.getStatus', (value) =>
      input.gate
        .run(() => input.operations.getStatus(value.operationId))
        .catch(operationNotFound),
    ),
    defineIpcBinding('operation.cancel', (value) =>
      input.gate
        .run(() => input.operations.cancel(value.operationId))
        .catch(operationNotFound),
    ),
  ]);
}
