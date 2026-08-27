import type { NoteraClient } from '../../platform/notera-client';
import { ActiveDocumentLifecycle } from '../../notes/document-lifecycle';
import { createExportController } from '../export-controller';
import { ExportOperationStore } from '../export-operation';

const operationId = '10000000-0000-4000-8000-000000000001';

describe('export controller', () => {
  it('registers a started operation before immediately reconciling getStatus', async () => {
    const calls: string[] = [];
    const request = jest.fn(async (key: string) => {
      calls.push(key);
      if (key === 'export.startNote') return { status: 'started', operationId };
      if (key === 'operation.getStatus') {
        return { operationId, kind: 'NOTE_EXPORT', state: 'RUNNING', phase: 'READING', progress: null };
      }
      throw new Error(`Unexpected ${key}`);
    });
    const store = new ExportOperationStore();
    const controller = createExportController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      lifecycle: new ActiveDocumentLifecycle(),
      store,
      getActiveNoteId: () => 'note',
    });

    await expect(controller.start({ noteId: 'note', format: 'PDF', save: 'try' })).resolves.toBe('started');
    expect(calls).toEqual(['export.startNote', 'operation.getStatus']);
    expect(store.getSnapshot()).toMatchObject({ operationId, phase: 'READING' });
  });

  it('offers the saved snapshot when flushing the active note fails', async () => {
    const lifecycle = new ActiveDocumentLifecycle();
    lifecycle.attach({ isDirty: () => true, flush: jest.fn().mockRejectedValue(new Error('save')), stop: jest.fn() });
    const request = jest.fn();
    const controller = createExportController({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      lifecycle,
      store: new ExportOperationStore(),
      getActiveNoteId: () => 'note',
    });

    await expect(controller.start({ noteId: 'note', format: 'MARKDOWN', save: 'try' })).resolves.toBe('save-failed');
    expect(request).not.toHaveBeenCalled();
  });
});
