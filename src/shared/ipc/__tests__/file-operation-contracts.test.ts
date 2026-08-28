import { ipcFailure } from '../common';
import {
  attachmentContracts,
  attachmentSummarySchema,
  MAX_ATTACHMENT_BYTES,
} from '../contracts/attachment';
import { exportContracts } from '../contracts/export';
import {
  operationCompleted,
  operationContracts,
  operationProgress,
  operationStatusSchema,
  profileLocked,
  startOperationResultSchema,
} from '../contracts/operation';

const uuid = (suffix: number) =>
  `10000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('file operation contract catalog', () => {
  it('defines the fixed attachment, export, task and event channels', () => {
    expect(
      [
        ...Object.values(attachmentContracts),
        ...Object.values(exportContracts),
        ...Object.values(operationContracts),
      ].map((contract) => contract.channel),
    ).toEqual([
      'notera:attachment:list-for-note',
      'notera:attachment:start-import',
      'notera:attachment:remove-from-note',
      'notera:attachment:get-preview-url',
      'notera:attachment:start-save-as',
      'notera:export:start-note',
      'notera:operation:get-status',
      'notera:operation:cancel',
    ]);
    expect([
      profileLocked.channel,
      operationProgress.channel,
      operationCompleted.channel,
    ]).toEqual([
      'notera:profile:locked',
      'notera:operation:progress',
      'notera:operation:completed',
    ]);
  });
});

describe('attachment and export contracts', () => {
  const attachment = {
    id: uuid(1),
    fileName: 'image.png',
    mime: 'image/png',
    byteLength: MAX_ATTACHMENT_BYTES,
    localState: 'AVAILABLE' as const,
    previewable: true,
    createdAt: 1,
  };

  it('accepts the 500 MiB attachment boundary and rejects one byte over', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(500 * 1024 * 1024);
    expect(attachmentSummarySchema.parse(attachment)).toEqual(attachment);
    expect(() =>
      attachmentSummarySchema.parse({
        ...attachment,
        byteLength: MAX_ATTACHMENT_BYTES + 1,
      }),
    ).toThrow();
  });

  it('never accepts paths, large bytes, keys, manifests or remote state', () => {
    const forbiddenFields = [
      ['path', 'C:\\secret'],
      ['bytes', new Uint8Array([1])],
      ['fileKey', 'key'],
      ['manifest', {}],
      ['chunks', []],
      ['remoteState', 'UPLOADED'],
    ] as const;

    forbiddenFields.forEach(([field, value]) => {
      expect(
        attachmentSummarySchema.safeParse({ ...attachment, [field]: value })
          .success,
      ).toBe(false);
    });
    expect(
      attachmentContracts.startImport.request.safeParse({
        noteId: uuid(2),
        path: 'C:\\secret',
      }).success,
    ).toBe(false);
  });

  it('accepts only unexpired notera-media preview URLs', () => {
    const expiresAt = Date.now() + 60_000;
    expect(
      attachmentContracts.getPreviewUrl.response.parse({
        ret: true,
        data: { url: 'notera-media://attachment/token', expiresAt },
      }),
    ).toBeDefined();
    expect(() =>
      attachmentContracts.getPreviewUrl.response.parse({
        ret: true,
        data: { url: 'file:///C:/secret', expiresAt },
      }),
    ).toThrow();
    expect(() =>
      attachmentContracts.getPreviewUrl.response.parse({
        ret: true,
        data: {
          url: 'notera-media://attachment/token',
          expiresAt: Date.now() - 1,
        },
      }),
    ).toThrow();
  });

  it('treats file picker cancellation as normal start data', () => {
    expect(startOperationResultSchema.parse({ status: 'cancelled' })).toEqual({
      status: 'cancelled',
    });
    expect(
      startOperationResultSchema.parse({
        status: 'started',
        operationId: uuid(3),
      }),
    ).toBeDefined();
    expect(
      exportContracts.startNote.request.parse({
        noteId: uuid(2),
        format: 'PDF',
      }),
    ).toEqual({ noteId: uuid(2), format: 'PDF' });
  });
});

describe('long operation state and events', () => {
  it('accepts determinate and indeterminate running progress', () => {
    const base = {
      operationId: uuid(1),
      kind: 'ATTACHMENT_IMPORT' as const,
      state: 'RUNNING' as const,
      phase: 'ENCRYPTING' as const,
    };

    expect(operationStatusSchema.parse({ ...base, progress: 0 })).toBeDefined();
    expect(operationStatusSchema.parse({ ...base, progress: 1 })).toBeDefined();
    expect(
      operationStatusSchema.parse({ ...base, progress: null }),
    ).toBeDefined();
    expect(() =>
      operationStatusSchema.parse({ ...base, progress: -0.1 }),
    ).toThrow();
    expect(() =>
      operationStatusSchema.parse({ ...base, progress: 1.1 }),
    ).toThrow();
    expect(() =>
      operationStatusSchema.parse({ ...base, progress: Number.NaN }),
    ).toThrow();
  });

  it('requires successful results to match the operation kind', () => {
    const completedAt = 10;
    expect(
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'ATTACHMENT_IMPORT',
        state: 'SUCCEEDED',
        result: {
          attachment: {
            id: uuid(4),
            fileName: 'archive.zip',
            mime: 'application/zip',
            byteLength: 500 * 1024 * 1024,
            localState: 'AVAILABLE',
            previewable: false,
            createdAt: 1,
          },
        },
      }),
    ).toBeDefined();
    expect(
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'ATTACHMENT_SAVE_AS',
        state: 'SUCCEEDED',
        result: { completedAt },
      }),
    ).toBeDefined();
    expect(
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'SUCCEEDED',
        result: {
          report: {
            format: 'PDF',
            packaging: 'ZIP',
            attachmentCount: 2,
            lossyNodeCount: 1,
            completedAt,
          },
        },
      }),
    ).toBeDefined();
    expect(() =>
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'SUCCEEDED',
        result: {
          report: {
            format: 'PDF',
            packaging: 'ARCHIVE',
            attachmentCount: 0,
            lossyNodeCount: 0,
            completedAt,
            path: 'C:\\private.pdf',
          },
        },
      }),
    ).toThrow();
  });

  it('keeps failed and cancelled terminal states distinct', () => {
    expect(
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'FAILED',
        error: ipcFailure('EXPORT_FAILED').error,
      }),
    ).toBeDefined();
    expect(
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'CANCELLED',
      }),
    ).toBeDefined();
    expect(() =>
      operationStatusSchema.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'CANCELLED',
        error: ipcFailure('EXPORT_FAILED').error,
      }),
    ).toThrow();
  });

  it('validates progress, completion and profile lock event payloads', () => {
    expect(
      operationProgress.payload.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        phase: 'RENDERING',
        progress: 0.5,
      }),
    ).toBeDefined();
    expect(
      operationCompleted.payload.parse({
        operationId: uuid(1),
        kind: 'NOTE_EXPORT',
        state: 'CANCELLED',
      }),
    ).toBeDefined();
    expect(profileLocked.payload.parse({ reason: 'SYSTEM_LOCK' })).toEqual({
      reason: 'SYSTEM_LOCK',
    });
    expect(() =>
      profileLocked.payload.parse({ reason: 'SYSTEM_LOCK', vaultId: uuid(9) }),
    ).toThrow();
  });
});
