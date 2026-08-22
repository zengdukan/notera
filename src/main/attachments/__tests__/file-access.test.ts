import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_ATTACHMENT_BYTES } from '../../../shared';
import { createAttachmentFileAccess } from '../file-access';

describe('attachment file access', () => {
  let root: string;
  let importPath: string | null;
  let savePath: string | null;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'notera-main-files-'));
    importPath = null;
    savePath = null;
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const create = () =>
    createAttachmentFileAccess({
      dialogs: {
        chooseImportPath: async () => importPath,
        chooseSavePath: async () => savePath,
      },
      randomUUID: () => '10000000-0000-4000-8000-000000000001',
    });

  it('opens the selected file as a bounded stream with a safe MIME', async () => {
    importPath = join(root, 'photo.JPEG');
    await writeFile(importPath, Uint8Array.from([1, 2, 3]));
    const selection = await create().chooseImport();
    const completed: number[] = [];
    const chunks: number[] = [];

    expect(selection).toMatchObject({
      fileName: 'photo.JPEG',
      mimeType: 'image/jpeg',
      byteLength: 3,
    });
    if (selection === null) throw new Error('selection missing');
    for await (const chunk of selection.open({
      signal: new AbortController().signal,
      onBytes: (value) => completed.push(value),
    })) {
      chunks.push(...chunk);
    }

    expect(chunks).toEqual([1, 2, 3]);
    expect(completed.at(-1)).toBe(3);
  });

  it('rejects directories and files above the attachment limit', async () => {
    importPath = root;
    await expect(create().chooseImport()).rejects.toMatchObject({
      code: 'ATTACHMENT_IMPORT_FAILED',
    });

    importPath = join(root, 'large.bin');
    const handle = await open(importPath, 'w');
    await handle.truncate(MAX_ATTACHMENT_BYTES + 1);
    await handle.close();
    await expect(create().chooseImport()).rejects.toMatchObject({
      code: 'ATTACHMENT_TOO_LARGE',
    });
  });

  it('falls back to application/octet-stream for unknown extensions', async () => {
    importPath = join(root, 'archive.unknown');
    await writeFile(importPath, Uint8Array.from([1]));

    await expect(create().chooseImport()).resolves.toMatchObject({
      fileName: 'archive.unknown',
      mimeType: 'application/octet-stream',
    });
  });

  it('writes through a same-directory part file and publishes atomically', async () => {
    savePath = join(root, 'saved.bin');
    const selection = await create().chooseSave();
    const completed: number[] = [];
    if (selection === null) throw new Error('selection missing');

    await selection.write({
      source: (async function* source() {
        yield Uint8Array.from([1, 2]);
        yield Uint8Array.from([3]);
      })(),
      byteLength: 3,
      signal: new AbortController().signal,
      onBytes: (value) => completed.push(value),
    });

    expect([...await readFile(savePath)]).toEqual([1, 2, 3]);
    expect(completed).toEqual([2, 3]);
    expect(await readdir(root)).toEqual(['saved.bin']);
  });

  it('removes only its part file when writing is cancelled', async () => {
    savePath = join(root, 'cancelled.bin');
    const selection = await create().chooseSave();
    const controller = new AbortController();
    controller.abort();
    if (selection === null) throw new Error('selection missing');

    await expect(
      selection.write({
        source: (async function* source() {
          yield Uint8Array.from([1]);
        })(),
        byteLength: 1,
        signal: controller.signal,
        onBytes: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });
    expect(await readdir(root)).toEqual([]);
  });
});
