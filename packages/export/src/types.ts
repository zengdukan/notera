import type { AdfDocument, AttachmentId } from '@notera/domain';

export type ExportFormat = 'MARKDOWN' | 'PDF';
export type ExportPackaging = 'DIRECT' | 'ZIP';

export interface ExportAttachment {
  readonly id: AttachmentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export interface PlannedAsset extends ExportAttachment {
  readonly relativePath: `assets/${string}`;
}

export interface NoteExportPlan {
  readonly format: ExportFormat;
  readonly packaging: ExportPackaging;
  readonly baseName: string;
  readonly documentFileName: string;
  readonly referencedAttachmentIds: readonly AttachmentId[];
  readonly assets: readonly PlannedAsset[];
}

export interface MarkdownResult {
  readonly bytes: Uint8Array;
  readonly lossyNodeCount: number;
}

export interface CreateNoteExportPlanInput {
  readonly requestedBaseName: string;
  readonly format: ExportFormat;
  readonly document: AdfDocument;
  readonly attachments: readonly ExportAttachment[];
}
