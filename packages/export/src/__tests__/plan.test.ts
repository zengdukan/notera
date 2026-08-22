import { asAdfDocument, asAttachmentId } from '@notera/domain';

import { ExportCoreError } from '../errors';
import { createNoteExportPlan } from '../plan';

const first = asAttachmentId('10000000-0000-4000-8000-000000000001');
const second = asAttachmentId('10000000-0000-4000-8000-000000000002');

const documentWith = (...ids: readonly string[]) =>
  asAdfDocument({
    type: 'doc',
    version: 1,
    content: ids.map((id) => ({ type: 'media', attrs: { id } })),
  });

describe('note export plans', () => {
  it('uses a direct document when the ADF has no attachments', () => {
    expect(
      createNoteExportPlan({
        requestedBaseName: 'Project',
        format: 'MARKDOWN',
        document: documentWith(),
        attachments: [],
      }),
    ).toEqual({
      format: 'MARKDOWN',
      packaging: 'DIRECT',
      baseName: 'Project',
      documentFileName: 'Project.md',
      referencedAttachmentIds: [],
      assets: [],
    });
  });

  it('creates a zip plan with unique assets in reference order', () => {
    const result = createNoteExportPlan({
      requestedBaseName: 'Project',
      format: 'PDF',
      document: documentWith(first, second, first),
      attachments: [
        {
          id: second,
          fileName: 'photo.png',
          mimeType: 'image/png',
          byteLength: 2,
        },
        {
          id: first,
          fileName: '../photo.png',
          mimeType: 'image/png',
          byteLength: 1,
        },
      ],
    });

    expect(result.packaging).toBe('ZIP');
    expect(result.documentFileName).toBe('Project.pdf');
    expect(result.referencedAttachmentIds).toEqual([first, second]);
    expect(result.assets.map((asset) => asset.relativePath)).toEqual([
      'assets/_photo.png',
      'assets/photo.png',
    ]);
  });

  it('fails when the ADF references missing attachment metadata', () => {
    expect(() =>
      createNoteExportPlan({
        requestedBaseName: 'Project',
        format: 'PDF',
        document: documentWith(first),
        attachments: [],
      }),
    ).toThrow(
      expect.objectContaining<Partial<ExportCoreError>>({
        code: 'ATTACHMENT_REFERENCE_MISSING',
      }),
    );
  });
});
