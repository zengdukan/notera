import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';

import { secureExportPdf } from '../pdf-postprocess';

const attachmentId = '20000000-0000-4000-8000-000000000002';

async function fixture(...uris: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 300]);
  const annotations = uris.map((uri, index) =>
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [10, 10 + index * 20, 200, 25 + index * 20],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(uri) },
    }),
  );
  page.node.set(PDFName.of('Annots'), pdf.context.obj(annotations));
  return pdf.save({ useObjectStreams: false });
}

async function uris(bytes: Uint8Array): Promise<Array<string | null>> {
  const pdf = await PDFDocument.load(bytes);
  const annots = pdf.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
  return annots.asArray().map((value) => {
    const annotation = pdf.context.lookup(value, PDFDict);
    const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict);
    return (
      action?.lookupMaybe(PDFName.of('URI'), PDFString)?.decodeText() ?? null
    );
  });
}

describe('secure PDF link post-processing', () => {
  it('rewrites attachment markers and preserves HTTP(S) links', async () => {
    const result = await secureExportPdf({
      bytes: await fixture(
        `notera-export-asset:${attachmentId}`,
        'https://example.com/help?q=1',
      ),
      assets: [
        {
          id: attachmentId,
          relativePath: 'assets/图片 1.png',
        },
      ],
      forbiddenValues: ['secret-token'],
    });

    expect(await uris(result.bytes)).toEqual([
      'assets/%E5%9B%BE%E7%89%87%201.png',
      'https://example.com/help?q=1',
    ]);
    expect(result.lossyNodeCount).toBe(0);
  });

  it('removes an unresolved asset action and reports one lossy node', async () => {
    const result = await secureExportPdf({
      bytes: await fixture('notera-export-asset:missing'),
      assets: [],
      forbiddenValues: [],
    });
    expect(await uris(result.bytes)).toEqual([null]);
    expect(result.lossyNodeCount).toBe(1);
  });

  it.each([
    'file:///D:/private.txt',
    'notera-export-media://job/token/file/id',
    'javascript:alert(1)',
    'custom://unsafe',
  ])('rejects unsafe URI %s', async (uri) => {
    await expect(
      secureExportPdf({
        bytes: await fixture(uri),
        assets: [],
        forbiddenValues: [],
      }),
    ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
  });
});
