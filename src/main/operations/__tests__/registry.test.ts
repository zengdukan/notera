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
const secondOperationId = '10000000-0000-4000-8000-000000000002';
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
  let complete!: (value: Value) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<Value>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return { promise, resolve: complete, reject: fail };
}

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

function setup(now: () => number = Date.now) {
  const progress: OperationProgressPayload[] = [];
  const completed: OperationTerminalStatus[] = [];
  let random = 0;
  const sink: OperationEventSink = {
    progress: (payload) => progress.push(payload),
    completed: (payload) => completed.push(payload),
  };
  return {
    registry: new OperationRegistry({
      sink,
      randomUUID: () => {
        random += 1;
        return random === 1 ? operationId : secondOperationId;
      },
      now,
    }),
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

  it('publishes NOTE_EXPORT reports and allows only one running export', async () => {
    const { registry, completed } = setup();
    const first = deferred<{
      readonly report: {
        readonly format: 'PDF';
        readonly packaging: 'ZIP';
        readonly attachmentCount: number;
        readonly lossyNodeCount: number;
        readonly completedAt: number;
      };
    }>();
    registry.beginSession('session-1');
    registry.start({
      kind: 'NOTE_EXPORT',
      execute: () => first.promise,
      mapError: () => ({
        code: 'EXPORT_FAILED',
        message: IPC_ERROR_MESSAGES.EXPORT_FAILED,
      }),
    });
    expect(() =>
      registry.start({
        kind: 'NOTE_EXPORT',
        execute: async () => ({
          report: {
            format: 'PDF',
            packaging: 'DIRECT',
            attachmentCount: 0,
            lossyNodeCount: 0,
            completedAt: 2,
          },
        }),
        mapError: () => ({
          code: 'EXPORT_FAILED',
          message: IPC_ERROR_MESSAGES.EXPORT_FAILED,
        }),
      }),
    ).toThrow(expect.objectContaining({ code: 'OPERATION_FAILED' }));

    first.resolve({
      report: {
        format: 'PDF',
        packaging: 'ZIP',
        attachmentCount: 2,
        lossyNodeCount: 1,
        completedAt: 1,
      },
    });
    await settle();
    expect(completed[0]).toMatchObject({
      kind: 'NOTE_EXPORT',
      state: 'SUCCEEDED',
      result: { report: { packaging: 'ZIP' } },
    });

    expect(() =>
      registry.start({
        kind: 'NOTE_EXPORT',
        execute: async () => ({
          report: {
            format: 'MARKDOWN',
            packaging: 'DIRECT',
            attachmentCount: 0,
            lossyNodeCount: 0,
            completedAt: 2,
          },
        }),
        mapError: () => ({
          code: 'EXPORT_FAILED',
          message: IPC_ERROR_MESSAGES.EXPORT_FAILED,
        }),
      }),
    ).not.toThrow();
  });

  it('throttles same-phase progress events but keeps query state current', async () => {
    let clock = 0;
    const { registry, progress } = setup(() => clock);
    const gate = deferred<{ readonly completedAt: number }>();
    registry.beginSession('session-1');
    const id = registry.start({
      kind: 'ATTACHMENT_SAVE_AS',
      execute: async (context) => {
        context.progress('PREPARING', 0);
        context.progress('PREPARING', 0.1);
        clock = 100;
        context.progress('PREPARING', 0.2);
        context.progress('WRITING', 0.3);
        context.progress('WRITING', 0.4);
        context.progress('WRITING', 1);
        return gate.promise;
      },
      mapError: () => ({
        code: 'ATTACHMENT_SAVE_FAILED',
        message: IPC_ERROR_MESSAGES.ATTACHMENT_SAVE_FAILED,
      }),
    });
    await settle();

    expect(registry.getStatus(id)).toMatchObject({
      phase: 'WRITING',
      progress: 1,
    });
    expect(
      progress.map(({ phase, progress: value }) => [phase, value]),
    ).toEqual([
      ['PREPARING', 0],
      ['PREPARING', 0.2],
      ['WRITING', 0.3],
      ['WRITING', 1],
    ]);
    gate.resolve({ completedAt: 1 });
    await settle();
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
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ApplicationError('OPERATION_ABORTED')),
            { once: true },
          );
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
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ApplicationError('OPERATION_ABORTED')),
            { once: true },
          );
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
