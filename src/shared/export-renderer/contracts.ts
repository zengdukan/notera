import { z } from 'zod';

import { adfDocumentSchema } from '../ipc/adf';
import { limitedUnicodeString, uuidSchema } from '../ipc/common';
import { MAX_ATTACHMENT_BYTES } from '../ipc/contracts/attachment';
import { noteTitleSchema } from '../ipc/contracts/content-tree';

export const EXPORT_RENDER_CHANNELS = Object.freeze({
  document: 'notera:export-render:document',
  ready: 'notera:export-render:ready',
  failed: 'notera:export-render:failed',
} as const);

export const exportRenderAttachmentSchema = z.strictObject({
  id: uuidSchema,
  fileName: limitedUnicodeString(255),
  mimeType: limitedUnicodeString(255),
  byteLength: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  relativePath: limitedUnicodeString(512),
});

export const exportRenderDocumentSchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
  title: noteTitleSchema,
  document: adfDocumentSchema,
  mediaBaseUrl: z
    .string()
    .regex(/^notera-export-media:\/\//u)
    .max(2048),
  attachments: z.array(exportRenderAttachmentSchema).max(1000),
});

export const exportRenderReadySchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
  lossyNodeCount: z.number().int().min(0),
});

export const exportRenderFailureSchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
});

export type ExportRenderAttachment = z.infer<
  typeof exportRenderAttachmentSchema
>;
export type ExportRenderDocument = z.infer<typeof exportRenderDocumentSchema>;
export type ExportRenderReady = z.infer<typeof exportRenderReadySchema>;
export type ExportRenderFailure = z.infer<typeof exportRenderFailureSchema>;
