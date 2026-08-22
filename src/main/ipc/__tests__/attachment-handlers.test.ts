import type {
  AttachmentContentReader,
  LocalAttachmentsService,
} from '@notera/application';

import { IPC_ERROR_MESSAGES, requestContracts } from '../../../shared';
import type {
  AttachmentFileAccess,
  ImportSelection,
  SaveSelection,
} from '../../attachments/file-access';
import { OperationRegistry } from '../../operations/registry';
import type {
  OperationProgressPayload,
  OperationTerminalStatus,
} from '../../operations/types';
import {
  createAttachmentBindings,
  type AttachmentHandlerDependencies,
} from '../attachment-handlers';

const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const noteId = uuid(1);
const attachmentId = uuid(2);
const operationId = uuid(3);
const attachment = {
  id: attachmentId,
  fileName: 'image.png',
  mime: 'image/png',
  byteLength: 3,
  localState: 'AVAILABLE' as const,
  previewable: true,
  createdAt: 1,
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function reader(bytes = Uint8Array.from([1, 2, 3])) {
  const close = jest.fn(async () => undefined);
  const value: AttachmentContentReader = {
    attachmentId: attachmentId as never,
    fileName: 'image.png',
    mimeType: 'image/png',
    byteLength: bytes.byteLength,
    stream: () =>
      (async function* stream() {
        yield bytes;
      })(),
    streamRange: () =>
      (async function* streamRange() {
        yield bytes;
      })(),
    close,
  };
  return { value, close };
}

function setup(input: {
  readonly importSelection?: ImportSelection | null;
  readonly saveSelection?: SaveSelection | null;
} = {}) {
  const progress: OperationProgressPayload[] = [];
  const completed: OperationTerminalStatus[] = [];
  const operations = new OperationRegistry({
    sink: {
      progress: (payload) => progress.push(payload),
      completed: (payload) => completed.push(payload),
    },
    randomUUID: () => operationId,
  });
  operations.beginSession('session-1');
  const opened = reader();
  const service: LocalAttachmentsService = {
    importAttachment: jest.fn(async (value) => {
      const bytes: number[] = [];
      for await (const chunk of value.source) bytes.push(...chunk);
      expect(bytes).toEqual([1, 2, 3]);
      return attachment as never;
    }),
    listForNote: jest.fn(async () => ({ items: [attachment] })) as never,
    openReader: jest.fn(async () => opened.value),
    removeFromNote: jest.fn(async () => undefined),
    collectGarbage: jest.fn(async () => ({
      scannedCount: 0,
      collectedCount: 0,
      retryCount: 0,
    })),
  };
  const files: AttachmentFileAccess = {
    chooseImport: jest.fn(async () => input.importSelection ?? null),
    chooseSave: jest.fn(async () => input.saveSelection ?? null),
  };
  const previewUrlProvider = {
    issue: jest.fn(async () => ({
      url: 'notera-media://preview/token',
      expiresAt: Date.now() + 300_000,
    })),
  };
  const gateRun = jest.fn();
  const gate: AttachmentHandlerDependencies['gate'] = {
    run: <Result>(operation: () => Promise<Result> | Result) => {
      gateRun();
      return Promise.resolve().then(operation);
    },
  };
  const dependencies: AttachmentHandlerDependencies = {
    service,
    files,
    operations,
    gate,
    previewUrlProvider,
    now: () => 9,
  };
  return {
    bindings: createAttachmentBindings(dependencies),
    operations,
    service,
    files,
    progress,
    completed,
    opened,
    gateRun,
    previewUrlProvider,
  };
}

function binding(
  bindings: ReturnType<typeof createAttachmentBindings>,
  key: keyof typeof requestContracts,
) {
  const value = bindings.find((candidate) => candidate.key === key);
  if (value === undefined) throw new Error(`Missing binding: ${key}`);
  return value;
}

describe('attachment and operation IPC handlers', () => {
  it('binds five attachment requests and two operation requests', () => {
    const { bindings } = setup();
    expect(bindings.map((value) => value.key)).toEqual([
      'attachment.listForNote',
      'attachment.startImport',
      'attachment.removeFromNote',
      'attachment.getPreviewUrl',
      'attachment.startSaveAs',
      'operation.getStatus',
      'operation.cancel',
    ]);
  });

  it('issues preview URLs through the session gate', async () => {
    const { bindings, gateRun, previewUrlProvider } = setup();
    const result = await binding(bindings, 'attachment.getPreviewUrl').invoke({
      attachmentId,
    });

    expect(result).toEqual({
      url: 'notera-media://preview/token',
      expiresAt: expect.any(Number),
    });
    expect(previewUrlProvider.issue).toHaveBeenCalledWith(attachmentId);
    expect(gateRun).toHaveBeenCalledTimes(1);
  });

  it('returns cancelled without creating an operation', async () => {
    const { bindings, completed } = setup({ importSelection: null });
    await expect(
      binding(bindings, 'attachment.startImport').invoke({ noteId }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(completed).toEqual([]);
  });

  it('streams an import through the operation registry with progress', async () => {
    const selection: ImportSelection = {
      fileName: 'image.png',
      mimeType: 'image/png',
      byteLength: 3,
      open: ({ onBytes }) =>
        (async function* source() {
          onBytes(3);
          yield Uint8Array.from([1, 2, 3]);
        })(),
    };
    const { bindings, operations, progress } = setup({
      importSelection: selection,
    });

    await expect(
      binding(bindings, 'attachment.startImport').invoke({ noteId }),
    ).resolves.toEqual({ status: 'started', operationId });
    await settle();
    expect(operations.getStatus(operationId)).toEqual({
      operationId,
      kind: 'ATTACHMENT_IMPORT',
      state: 'SUCCEEDED',
      result: { attachment },
    });
    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'READING', progress: 1 }),
      ]),
    );
    expect(progress.at(-1)).toMatchObject({
      phase: 'FINALIZING',
      progress: 1,
    });
  });

  it('streams save-as and closes the reader on success', async () => {
    const written: number[] = [];
    const selection: SaveSelection = {
      write: async ({ source, onBytes }) => {
        for await (const chunk of source) written.push(...chunk);
        onBytes(written.length);
      },
    };
    const { bindings, operations, opened } = setup({ saveSelection: selection });

    await expect(
      binding(bindings, 'attachment.startSaveAs').invoke({ attachmentId }),
    ).resolves.toEqual({ status: 'started', operationId });
    await settle();
    expect(written).toEqual([1, 2, 3]);
    expect(opened.close).toHaveBeenCalledTimes(1);
    expect(operations.getStatus(operationId)).toEqual({
      operationId,
      kind: 'ATTACHMENT_SAVE_AS',
      state: 'SUCCEEDED',
      result: { completedAt: 9 },
    });
  });

  it('passes list/remove through the gate and maps missing operations', async () => {
    const { bindings, service } = setup();
    await expect(
      binding(bindings, 'attachment.listForNote').invoke({ noteId, limit: 10 }),
    ).resolves.toEqual({ items: [attachment] });
    await expect(
      binding(bindings, 'attachment.removeFromNote').invoke({
        noteId,
        attachmentId,
      }),
    ).resolves.toEqual({});
    expect(service.removeFromNote).toHaveBeenCalledWith({ noteId, attachmentId });

    await expect(
      binding(bindings, 'operation.getStatus').invoke({ operationId: uuid(99) }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'OPERATION_NOT_FOUND',
        message: IPC_ERROR_MESSAGES.OPERATION_NOT_FOUND,
      }),
    );
  });
});
