import type { ActiveDocumentLifecycle } from '../notes/document-lifecycle';
import type { NoteraClient } from '../platform/notera-client';
import type { ExportOperationStore } from './export-operation';

export type ExportFormat = 'MARKDOWN' | 'PDF';
export type ExportStartResult = 'started' | 'dialog-cancelled' | 'save-failed';

export interface ExportController {
  start(input: {
    readonly noteId: string;
    readonly format: ExportFormat;
    readonly save: 'try' | 'saved';
  }): Promise<ExportStartResult>;
  cancel(): Promise<void>;
}

export function createExportController(input: {
  readonly client: NoteraClient;
  readonly lifecycle: ActiveDocumentLifecycle;
  readonly store: ExportOperationStore;
  readonly getActiveNoteId: () => string | undefined;
}): ExportController {
  let cancelledId: string | undefined;
  return {
    async start(value) {
      if (value.save === 'try' && input.getActiveNoteId() === value.noteId) {
        try {
          await input.lifecycle.flush();
        } catch {
          return 'save-failed';
        }
      }
      const started = await input.client.request('export.startNote', {
        noteId: value.noteId,
        format: value.format,
      });
      if (started.status === 'cancelled') return 'dialog-cancelled';
      input.store.track(started.operationId);
      try {
        const status = await input.client.request('operation.getStatus', {
          operationId: started.operationId,
        });
        input.store.applyStatus(status);
      } catch (error) {
        if (input.store.getSnapshot()?.state === 'RUNNING') throw error;
      }
      return 'started';
    },
    async cancel() {
      const current = input.store.getSnapshot();
      if (
        !current ||
        current.state !== 'RUNNING' ||
        cancelledId === current.operationId
      )
        return;
      cancelledId = current.operationId;
      const status = await input.client.request('operation.cancel', {
        operationId: current.operationId,
      });
      input.store.applyStatus(status);
    },
  };
}
