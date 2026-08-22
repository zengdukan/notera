import { collectAttachmentReferences } from './adf-references';
import { ExportCoreError } from './errors';
import { allocateUniqueName, sanitizeWindowsBaseName } from './filenames';
import type { CreateNoteExportPlanInput, NoteExportPlan } from './types';

export function createNoteExportPlan(
  input: CreateNoteExportPlanInput,
): NoteExportPlan {
  const baseName = sanitizeWindowsBaseName(
    input.requestedBaseName,
    '未命名笔记',
  );
  const referencedAttachmentIds = collectAttachmentReferences(input.document);
  const attachments = new Map(
    input.attachments.map((attachment) => [attachment.id, attachment] as const),
  );
  const used = new Set<string>();
  const assets = referencedAttachmentIds.map((attachmentId) => {
    const attachment = attachments.get(attachmentId);
    if (attachment === undefined) {
      throw new ExportCoreError('ATTACHMENT_REFERENCE_MISSING');
    }
    const requested = sanitizeWindowsBaseName(attachment.fileName, '附件', 180);
    const fileName = allocateUniqueName(requested, used, 180);
    used.add(fileName.toLocaleLowerCase('en-US'));
    return Object.freeze({
      ...attachment,
      relativePath: `assets/${fileName}` as const,
    });
  });
  return Object.freeze({
    format: input.format,
    packaging: assets.length === 0 ? 'DIRECT' : 'ZIP',
    baseName,
    documentFileName: `${baseName}.${input.format === 'PDF' ? 'pdf' : 'md'}`,
    referencedAttachmentIds: Object.freeze(referencedAttachmentIds),
    assets: Object.freeze(assets),
  });
}
