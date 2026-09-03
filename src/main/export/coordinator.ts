import type {
  LocalAttachmentsService,
  LocalNotesService,
} from '@notera/application';
import {
  createNoteExportPlan,
  renderMarkdown,
  type ExportFormat,
  type MarkdownLocale,
  type PlannedAsset,
} from '@notera/export';

import { requestContracts } from '../../shared';
import type { SessionCommandGate } from '../ipc/local-notes-handlers';
import { MainIpcError, normalizeExportError, toIpcError } from '../ipc/errors';
import { OperationRegistry } from '../operations/registry';
import type { OperationContext } from '../operations/types';
import type { ExportEntry, ExportFileAccess, PdfRenderHost } from './types';

export interface NoteExportCoordinator {
  start(input: {
    readonly noteId: string;
    readonly format: ExportFormat;
  }): Promise<
    | { readonly status: 'cancelled' }
    | { readonly status: 'started'; readonly operationId: string }
  >;
  close(): Promise<void>;
}

function ratio(completed: number, total: number): number | null {
  if (total === 0) return null;
  return Math.min(1, Math.max(0, completed / total));
}

async function listAllAttachments(
  service: LocalAttachmentsService,
  noteId: string,
) {
  const items: Awaited<
    ReturnType<LocalAttachmentsService['listForNote']>
  >['items'][number][] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await service.listForNote({
      noteId: noteId as never,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...page.items);
    const next = page.nextCursor;
    if (next !== undefined) {
      if (cursors.has(next)) throw new MainIpcError('EXPORT_FAILED');
      cursors.add(next);
    }
    cursor = next;
  } while (cursor !== undefined);
  return items;
}

function assetEntry(
  asset: PlannedAsset,
  service: LocalAttachmentsService,
): ExportEntry {
  return Object.freeze({
    archivePath: asset.relativePath,
    byteLength: asset.byteLength,
    async *open(signal: AbortSignal) {
      const reader = await service.openReader(asset.id);
      try {
        if (
          reader.byteLength !== asset.byteLength ||
          reader.attachmentId !== asset.id
        ) {
          throw new MainIpcError('BLOB_CORRUPT');
        }
        for await (const chunk of reader.stream()) {
          if (signal.aborted) return;
          yield chunk;
        }
      } finally {
        await reader.close();
      }
    },
  });
}

function bytesEntry(path: string, bytes: Uint8Array): ExportEntry {
  return Object.freeze({
    archivePath: path,
    byteLength: bytes.byteLength,
    async *open(signal: AbortSignal) {
      if (!signal.aborted) yield bytes;
    },
  });
}

function addLossy(first: number, second: number): number {
  const total = first + second;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new MainIpcError('EXPORT_FAILED');
  }
  return total;
}

export function createNoteExportCoordinator(input: {
  readonly notes: LocalNotesService;
  readonly attachments: LocalAttachmentsService;
  readonly files: ExportFileAccess;
  readonly pdfHost: PdfRenderHost;
  readonly operations: OperationRegistry;
  readonly gate: SessionCommandGate;
  readonly getLocale: () => MarkdownLocale;
  readonly now: () => number;
}): NoteExportCoordinator {
  let busy = false;
  let closing = false;
  let idle: Promise<void> = Promise.resolve();
  let releaseIdle: (() => void) | undefined;

  const release = () => {
    if (!busy) return;
    busy = false;
    releaseIdle?.();
    releaseIdle = undefined;
  };

  const start: NoteExportCoordinator['start'] = async (value) => {
    if (closing || busy) throw new MainIpcError('EXPORT_FAILED');
    busy = true;
    idle = new Promise((resolve) => {
      releaseIdle = resolve;
    });
    let operationStarted = false;
    try {
      const snapshot = await input.gate.run(async () => ({
        note: await input.notes.getNote(value.noteId as never),
        attachments: await listAllAttachments(input.attachments, value.noteId),
        locale: input.getLocale(),
      }));
      const plan = createNoteExportPlan({
        requestedBaseName: snapshot.note.title,
        format: value.format,
        document: snapshot.note.document,
        attachments: snapshot.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mime,
          byteLength: attachment.byteLength,
        })),
      });
      const summaries = new Map(
        snapshot.attachments.map((attachment) => [attachment.id, attachment]),
      );
      plan.assets.forEach((asset) => {
        const summary = summaries.get(asset.id);
        if (summary?.localState === 'MISSING') {
          throw new MainIpcError('BLOB_MISSING');
        }
        if (summary?.localState === 'CORRUPT') {
          throw new MainIpcError('BLOB_CORRUPT');
        }
      });
      const selection = await input.files.choose({
        suggestedBaseName: plan.baseName,
        format: value.format,
        packaging: plan.packaging,
      });
      if (selection === null) {
        release();
        return { status: 'cancelled' as const };
      }
      if (selection.packaging !== plan.packaging) {
        throw new MainIpcError('EXPORT_FAILED');
      }

      const operationId = input.operations.start({
        kind: 'NOTE_EXPORT',
        execute: async (context: OperationContext) => {
          try {
            context.progress('PREPARING', 0);
            const assetsById = new Map(
              plan.assets.map((asset) => [asset.id, asset]),
            );
            const core = renderMarkdown({
              document: snapshot.note.document,
              assetsById,
              locale: snapshot.locale,
            });
            let documentBytes: Uint8Array;
            let { lossyNodeCount } = core;
            context.progress('READING', 0);
            if (value.format === 'PDF') {
              context.progress('RENDERING', null);
              const rendered = await input.pdfHost.render({
                operationId: context.signal.aborted ? '' : operationId,
                title: snapshot.note.title,
                document: snapshot.note.document,
                assets: plan.assets,
                signal: context.signal,
                onResourceBytes: () => context.progress('RENDERING', null),
              });
              documentBytes = rendered.bytes;
              lossyNodeCount = addLossy(
                lossyNodeCount,
                rendered.lossyNodeCount,
              );
            } else {
              context.progress('RENDERING', 1);
              documentBytes = core.bytes;
            }
            const extension = value.format === 'PDF' ? 'pdf' : 'md';
            const entries = [
              bytesEntry(`${selection.baseName}.${extension}`, documentBytes),
              ...plan.assets.map((asset) =>
                assetEntry(asset, input.attachments),
              ),
            ];
            context.progress('WRITING', 0);
            await selection.write({
              entries,
              signal: context.signal,
              onBytes: (completed, total) =>
                context.progress('WRITING', ratio(completed, total)),
            });
            context.progress('FINALIZING', 1);
            return {
              report: {
                format: value.format,
                packaging: plan.packaging,
                attachmentCount: plan.assets.length,
                lossyNodeCount,
                completedAt: input.now(),
              },
            };
          } finally {
            release();
          }
        },
        mapError: (error) =>
          toIpcError(
            requestContracts['export.startNote'],
            normalizeExportError(error),
          ),
      });
      operationStarted = true;
      return { status: 'started' as const, operationId };
    } catch (error) {
      if (!operationStarted) release();
      throw normalizeExportError(error);
    }
  };

  return Object.freeze({
    start,
    async close() {
      closing = true;
      await idle;
    },
  });
}
