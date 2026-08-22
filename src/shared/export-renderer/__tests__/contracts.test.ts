import { MAX_ATTACHMENT_BYTES } from '../../ipc/contracts/attachment';
import {
  exportRenderDocumentSchema,
  exportRenderFailureSchema,
  exportRenderReadySchema,
} from '../contracts';

const operationId = '10000000-0000-4000-8000-000000000001';
const attachmentId = '20000000-0000-4000-8000-000000000002';
const nonce = 'n'.repeat(43);

const attachment = {
  id: attachmentId,
  fileName: 'photo.png',
  mimeType: 'image/png',
  byteLength: MAX_ATTACHMENT_BYTES,
  relativePath: 'assets/photo.png',
};

const document = {
  operationId,
  nonce,
  title: 'Export title',
  document: {
    version: 1 as const,
    type: 'doc' as const,
    content: [{ type: 'paragraph' }],
  },
  mediaBaseUrl: 'notera-export-media://10000000-0000-4000-8000-000000000001',
  attachments: [attachment],
};

describe('export renderer internal contracts', () => {
  it('accepts the bounded document payload and strict terminal reports', () => {
    expect(exportRenderDocumentSchema.parse(document)).toEqual(document);
    expect(
      exportRenderReadySchema.parse({ operationId, nonce, lossyNodeCount: 2 }),
    ).toEqual({ operationId, nonce, lossyNodeCount: 2 });
    expect(exportRenderFailureSchema.parse({ operationId, nonce })).toEqual({
      operationId,
      nonce,
    });
  });

  it.each([
    { ...document, leakedPath: 'C:\\private' },
    { ...document, operationId: 'invalid' },
    { ...document, nonce: 'short' },
    { ...document, mediaBaseUrl: 'https://example.test/media' },
    { ...document, document: { type: 'doc', version: 2 } },
    { ...document, attachments: Array(1001).fill(attachment) },
    {
      ...document,
      attachments: [{ ...attachment, byteLength: MAX_ATTACHMENT_BYTES + 1 }],
    },
  ])('rejects an unsafe or unbounded document payload', (value) => {
    expect(exportRenderDocumentSchema.safeParse(value).success).toBe(false);
  });

  it('rejects extra or mismatched terminal fields', () => {
    expect(
      exportRenderReadySchema.safeParse({
        operationId,
        nonce,
        lossyNodeCount: 0,
        path: 'C:\\private',
      }).success,
    ).toBe(false);
    expect(
      exportRenderFailureSchema.safeParse({ operationId, nonce: 'bad' })
        .success,
    ).toBe(false);
  });
});
