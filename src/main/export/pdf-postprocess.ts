import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';

import { MainIpcError } from '../ipc/errors';

const ASSET_SCHEME = 'notera-export-asset:';

function uriText(action: PDFDict): string | undefined {
  const value = action.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString);
  return value?.decodeText();
}

function safeAssetPath(value: string): boolean {
  return (
    /^assets\/[^/\\]+$/u.test(value) &&
    !value.includes('..') &&
    !/^[a-z]:/iu.test(value)
  );
}

function isHttpUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function secureExportPdf(input: {
  readonly bytes: Uint8Array;
  readonly assets: readonly {
    readonly id: string;
    readonly relativePath: string;
  }[];
  readonly forbiddenValues: readonly string[];
}): Promise<{ readonly bytes: Uint8Array; readonly lossyNodeCount: number }> {
  try {
    const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
    const pdf = await PDFDocument.load(input.bytes);
    let lossyNodeCount = 0;
    for (const page of pdf.getPages()) {
      const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (annotations === undefined) continue;
      for (const reference of annotations.asArray()) {
        const annotation = pdf.context.lookup(reference, PDFDict);
        const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict);
        if (action === undefined) continue;
        const uri = uriText(action);
        if (uri === undefined) {
          annotation.delete(PDFName.of('A'));
          lossyNodeCount += 1;
          continue;
        }
        if (uri.startsWith(ASSET_SCHEME)) {
          const asset = assets.get(uri.slice(ASSET_SCHEME.length));
          if (asset === undefined || !safeAssetPath(asset.relativePath)) {
            annotation.delete(PDFName.of('A'));
            lossyNodeCount += 1;
            continue;
          }
          action.set(
            PDFName.of('URI'),
            PDFString.of(encodeURI(asset.relativePath)),
          );
          continue;
        }
        if (!isHttpUri(uri)) throw new MainIpcError('EXPORT_FAILED');
      }
    }
    const bytes = await pdf.save({ useObjectStreams: false });
    const serialized = Buffer.from(bytes).toString('latin1');
    const forbidden = [
      'notera-export-media:',
      ASSET_SCHEME,
      ...input.forbiddenValues.filter((value) => value.length > 0),
    ];
    if (forbidden.some((value) => serialized.includes(value))) {
      throw new MainIpcError('EXPORT_FAILED');
    }
    return { bytes, lossyNodeCount };
  } catch (error) {
    if (error instanceof MainIpcError) throw error;
    throw new MainIpcError('EXPORT_FAILED');
  }
}
