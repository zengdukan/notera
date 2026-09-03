import type {
  LocalAttachmentsService,
  LocalNotesService,
} from '@notera/application';

import { OperationRegistry } from '../../operations/registry';
import { createNoteExportCoordinator } from '../coordinator';
import type { ExportSelection, PdfRenderHost } from '../types';

const noteId = '10000000-0000-4000-8000-000000000001';
const attachmentId = '20000000-0000-4000-8000-000000000002';
const operationId = '30000000-0000-4000-8000-000000000003';

function deferred<T>() {
  let resolveDeferred!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });
  return { promise, resolve: resolveDeferred };
}

function setup(input?: {
  readonly document?: any;
  readonly attachments?: readonly any[];
  readonly selection?: ExportSelection | null | Promise<ExportSelection | null>;
  readonly locale?: 'en' | 'zh-CN';
}) {
  const terminal = deferred<any>();
  const progress: unknown[] = [];
  const written: Array<{ path: string; bytes: number[] }> = [];
  const readers: Array<{ close: jest.Mock }> = [];
  const defaultSelection: ExportSelection = {
    baseName: 'Chosen',
    packaging: (input?.attachments?.length ?? 0) > 0 ? 'ZIP' : 'DIRECT',
    async write({ entries, signal, onBytes }) {
      let completed = 0;
      for (const entry of entries) {
        const bytes: number[] = [];
        for await (const chunk of entry.open(signal)) bytes.push(...chunk);
        completed += bytes.length;
        onBytes(
          completed,
          entries.reduce((sum, value) => sum + value.byteLength, 0),
        );
        written.push({ path: entry.archivePath, bytes });
      }
    },
  };
  const operations = new OperationRegistry({
    randomUUID: () => operationId,
    now: () => 100,
    sink: {
      progress: (value) => progress.push(value),
      completed: (value) => terminal.resolve(value),
    },
  });
  operations.beginSession('epoch');
  const attachments = input?.attachments ?? [];
  const notes = {
    getNote: jest.fn(async () => ({
      kind: 'note',
      id: noteId,
      title: 'Saved title',
      folderId: '40000000-0000-4000-8000-000000000004',
      contentVersion: 1,
      updatedAt: 1,
      createdAt: 1,
      tags: [],
      document:
        input?.document ??
        ({
          type: 'doc',
          version: 1,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
          ],
        } as const),
    })),
  } as unknown as LocalNotesService;
  const localAttachments = {
    listForNote: jest.fn(async ({ cursor }) => {
      if (cursor === undefined && attachments.length > 1) {
        return { items: [attachments[0]], nextCursor: 'next' };
      }
      return {
        items: attachments.length > 1 ? attachments.slice(1) : attachments,
      };
    }),
    openReader: jest.fn(async () => {
      const close = jest.fn(async () => undefined);
      readers.push({ close });
      return {
        attachmentId,
        fileName: 'photo.png',
        mimeType: 'image/png',
        byteLength: 2,
        stream: () =>
          (async function* stream() {
            yield Uint8Array.of(8, 9);
          })(),
        streamRange: jest.fn(),
        close,
      };
    }),
  } as unknown as LocalAttachmentsService;
  const files = {
    choose: jest.fn(async () =>
      Promise.resolve(
        input?.selection === undefined ? defaultSelection : input.selection,
      ),
    ),
  };
  const pdfHost: PdfRenderHost = {
    render: jest.fn(async () => ({
      bytes: Uint8Array.of(5, 6),
      lossyNodeCount: 2,
    })),
    close: jest.fn(async () => undefined),
  };
  const gate = {
    async run<Result>(operation: () => Promise<Result> | Result) {
      return operation();
    },
  };
  const coordinator = createNoteExportCoordinator({
    notes,
    attachments: localAttachments,
    files,
    pdfHost,
    operations,
    gate,
    getLocale: () => input?.locale ?? 'en',
    now: () => 123,
  });
  return {
    coordinator,
    terminal: terminal.promise,
    progress,
    written,
    readers,
    notes,
    attachments: localAttachments,
    files,
    pdfHost,
  };
}

const availableAttachment = {
  id: attachmentId,
  fileName: 'photo.png',
  mime: 'image/png',
  byteLength: 2,
  localState: 'AVAILABLE',
  previewable: true,
  createdAt: 1,
};

const mediaDocument = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { id: attachmentId, type: 'file' } }],
    },
  ],
};

describe('note export coordinator', () => {
  it('exports the saved Markdown snapshot directly with a safe report', async () => {
    const state = setup();
    await expect(
      state.coordinator.start({ noteId, format: 'MARKDOWN' }),
    ).resolves.toEqual({ status: 'started', operationId });
    const terminal = await state.terminal;

    expect(state.notes.getNote).toHaveBeenCalledWith(noteId);
    expect(state.written).toEqual([
      { path: 'Chosen.md', bytes: Array.from(Buffer.from('Hello\n', 'utf8')) },
    ]);
    expect(terminal).toMatchObject({
      state: 'SUCCEEDED',
      result: {
        report: {
          format: 'MARKDOWN',
          packaging: 'DIRECT',
          attachmentCount: 0,
          lossyNodeCount: 0,
          completedAt: 123,
        },
      },
    });
    expect(JSON.stringify(terminal)).not.toContain('Saved title');
  });

  it('paginates, deduplicates references, writes one asset, and closes its reader', async () => {
    const state = setup({
      document: mediaDocument,
      attachments: [
        availableAttachment,
        { ...availableAttachment, id: '50000000-0000-4000-8000-000000000005' },
      ],
    });
    await state.coordinator.start({ noteId, format: 'MARKDOWN' });
    await state.terminal;

    expect(state.attachments.listForNote).toHaveBeenNthCalledWith(1, {
      noteId,
      limit: 100,
    });
    expect(state.attachments.listForNote).toHaveBeenNthCalledWith(2, {
      noteId,
      limit: 100,
      cursor: 'next',
    });
    expect(state.written.map((entry) => entry.path)).toEqual([
      'Chosen.md',
      'assets/photo.png',
    ]);
    expect(state.attachments.openReader).toHaveBeenCalledTimes(1);
    expect(state.readers[0].close).toHaveBeenCalledTimes(1);
  });

  it('formats Markdown dates with the current Notera language', async () => {
    const state = setup({
      locale: 'zh-CN',
      document: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'date', attrs: { timestamp: '1788393600000' } }],
          },
        ],
      },
    });

    await state.coordinator.start({ noteId, format: 'MARKDOWN' });
    await state.terminal;

    expect(state.written).toEqual([
      {
        path: 'Chosen.md',
        bytes: Array.from(Buffer.from('`2026年9月3日`\n', 'utf8')),
      },
    ]);
  });

  it('rejects unavailable referenced attachments before opening the dialog', async () => {
    const state = setup({
      document: mediaDocument,
      attachments: [{ ...availableAttachment, localState: 'MISSING' }],
    });
    await expect(
      state.coordinator.start({ noteId, format: 'PDF' }),
    ).rejects.toMatchObject({ code: 'BLOB_MISSING' });
    expect(state.files.choose).not.toHaveBeenCalled();
  });

  it('returns cancelled without creating an operation', async () => {
    const state = setup({ selection: null });
    await expect(
      state.coordinator.start({ noteId, format: 'PDF' }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(state.progress).toEqual([]);
  });

  it('keeps the synchronous busy guard through dialog and executor cleanup', async () => {
    const dialog = deferred<ExportSelection | null>();
    const state = setup({ selection: dialog.promise });
    const first = state.coordinator.start({ noteId, format: 'MARKDOWN' });
    await Promise.resolve();
    await expect(
      state.coordinator.start({ noteId, format: 'MARKDOWN' }),
    ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    dialog.resolve(null);
    await expect(first).resolves.toEqual({ status: 'cancelled' });
    expect(state.files.choose).toHaveBeenCalledTimes(1);
  });

  it('uses the PDF host and safely combines renderer and core loss counts', async () => {
    const state = setup({
      document: {
        type: 'doc',
        version: 1,
        content: [{ type: 'unsupportedNode', attrs: {} }],
      },
    });
    await state.coordinator.start({ noteId, format: 'PDF' });
    const terminal = await state.terminal;
    expect(state.pdfHost.render).toHaveBeenCalled();
    expect(state.written).toEqual([{ path: 'Chosen.pdf', bytes: [5, 6] }]);
    expect(terminal.result.report.lossyNodeCount).toBe(3);
  });
});
