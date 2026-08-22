import {
  asAttachmentId,
  type AdfDocument,
  type AttachmentId,
} from '@notera/domain';

export function collectAttachmentReferences(
  document: AdfDocument,
): readonly AttachmentId[] {
  const stack: unknown[] = [document];
  const seen = new Set<string>();
  const references: AttachmentId[] = [];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push(value[index]);
      }
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Readonly<Record<string, unknown>>;
    if (record.type === 'media') {
      const { attrs } = record;
      if (typeof attrs === 'object' && attrs !== null) {
        const { id } = attrs as Readonly<Record<string, unknown>>;
        try {
          const attachmentId = asAttachmentId(id);
          if (!seen.has(attachmentId)) {
            seen.add(attachmentId);
            references.push(attachmentId);
          }
        } catch {
          // Invalid media is rendered as an explicit lossy placeholder later.
        }
      }
    }
    const children = Object.values(record);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return Object.freeze(references);
}
