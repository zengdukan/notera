import { ApplicationError } from '@notera/application';

import { IPC_ERROR_MESSAGES } from '../../../shared';
import { OperationRegistry } from '../registry';
import type {
  OperationContext,
  OperationEventSink,
  OperationProgressPayload,
  OperationTerminalStatus,
} from '../types';

const operationId = '10000000-0000-4000-8000-000000000001';
const attachmentId = '20000000-0000-4000-8000-000000000002';
const attachment = {
  id: attachmentId,
  fileName: 'image.png',
  mime: 'image/png',
  byteLength: 3,
  localState: 'AVAILABLE' as const,
  previewable: true,
  createdAt: 1,
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup() {
  const progress: OperationProgressPayload[] = [];
  const completed: OperationTerminalStatus[] = [];
  const sink: OperationEventSink = {
    progress: (payload) => progress.push(payload),
    completed: (payload) => completed.push(payload),
  };
  return {
    registry: new OperationRegistry({ sink, randomUUID: () => operationId }),
    progress,
    completed,
  };
}

describe('session operation registry', () => {
  it('rejects operations while locked and prevents replacing a session', async () => {
    const { registry } = setup();
    expect(() =>
      registry.start({
        kind: 'ATTACHMENT_SAVE_AS',
        execute: async () => ({ completedAt: 1 }),
        mapError: () => ({
          code: 'ATTACHMENT_SAVE_FAILED',
          message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
        }),
      }),
    ).toThrow(expect.objectContaining({ code: 'PROFILE_LOCKED' }));
    expect(() => registry.getStatus(operationId)).toThrow(
      expect.objectContaining({ code: 'PROFILE_LOCKED' }),
    );
    await expect(registry.cancel(operationId)).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });

    registry.beginSession('session-1');
    expect(() => registry.beginSession('session-2')).toThrow(
      expect.objectContaining({ code: 'OPERATION_FAILED' }),
    );
  });

  it('publishes kind-matched success results', async () => {
    const { registry, completed } = setup();
    registry.beginSession('session-1');
    const importedId = registry.start({
      kind: 'ATTACHMENT_IMPORT',
      execute: async () => ({ attachment }),
      mapError: () => ({
        code: 'ATTACHMENT_IMPORT_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_IMPORT_FAILED,
      }),
    });
    await settle();

    expect(registry.getStatus(importedId)).toEqual({
      operationId,
      kind: 'ATTACHMENT_IMPORT',
      state: 'SUCCEEDED',
      result: { attachment },
    });
    expect(completed).toEqual([registry.getStatus(importedId)]);
  });

  it('publishes bounded progress and ignores invalid or late updates', async () => {
    const { registry, progress } = setup();
    const gate = deferred<{ readonly completedAt: number }>();
    let context!: OperationContext;
    registry.beginSession('session-1');
    const id = registry.start({
      kind: 'ATTACHMENT_SAVE_AS',
      execute: async (value) => {
        context = value;
        value.progress('WRITING', 0.5);
        value.progress('WRITING', Number.NaN);
        value.progress('WRITING', 2);
        value.progress('UNKNOWN' as never, 0.75);
        return gate.promise;
      },
      mapError: () => ({
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      }),
    });
    await settle();

    expect(registry.getStatus(id)).toMatchObject({
      state: 'RUNNING',
      phase: 'WRITING',
      progress: 0.5,
    });
    expect(progress).toEqual([
      {
        operationId,
        kind: 'ATTACHMENT_SAVE_AS',
        phase: 'WRITING',
        progress: 0.5,
      },
    ]);

    gate.resolve({ completedAt: 2 });
    await settle();
    context.progress('FINALIZING', 1);
    expect(progress).toHaveLength(1);
  });

  it('maps failures without exposing the original error', async () => {
    const { registry, completed } = setup();
    registry.beginSession('session-1');
    const id = registry.start({
      kind: 'ATTACHMENT_SAVE_AS',
      execute: async () => {
        throw new Error('C:\\private\\target.txt');
      },
      mapError: () => ({
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      }),
    });
    await settle();

    expect(registry.getStatus(id)).toEqual({
      operationId,
      kind: 'ATTACHMENT_SAVE_AS',
      state: 'FAILED',
      error: {
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      },
    });
    expect(JSON.stringify(completed)).not.toContain('private');
  });

  it('cancels once, waits for the executor and keeps the terminal state', async () => {
    const { registry, completed } = setup();
    registry.beginSession('session-1');
    const id = registry.start({
      kind: 'ATTACHMENT_SAVE_AS',
      execute: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ApplicationError('OPERATION_ABORTED')),
            { once: true },
          );
          void resolve;
        }),
      mapError: () => ({
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      }),
    });
    await settle();

    await expect(registry.cancel(id)).resolves.toMatchObject({
      state: 'CANCELLED',
    });
    await expect(registry.cancel(id)).resolves.toEqual(registry.getStatus(id));
    expect(completed).toHaveLength(1);
  });

  it('ends all work, clears identifiers and permits a fresh session', async () => {
    const { registry, completed } = setup();
    registry.beginSession('session-1');
    registry.start({
      kind: 'ATTACHMENT_SAVE_AS',
      execute: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ApplicationError('OPERATION_ABORTED')),
            { once: true },
          );
          void resolve;
        }),
      mapError: () => ({
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      }),
    });
    await settle();

    await registry.endSession();
    expect(completed).toHaveLength(1);
    expect(() => registry.getStatus(operationId)).toThrow(
      expect.objectContaining({ code: 'PROFILE_LOCKED' }),
    );

    registry.beginSession('session-2');
    expect(() => registry.getStatus(operationId)).toThrow(
      expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }),
    );
    await registry.endSession();
  });
});
