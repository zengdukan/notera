/** @jest-environment node */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MediaStore, mediaTypeFor } from '../store';

describe('MediaStore', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'notera-media-store-'),
    );
  });

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true });
  });

  it('classifies Atlaskit media types', () => {
    expect(mediaTypeFor('image/png')).toBe('image');
    expect(mediaTypeFor('video/mp4')).toBe('video');
    expect(mediaTypeFor('audio/mpeg')).toBe('audio');
    expect(mediaTypeFor('application/zip')).toBe('archive');
    expect(mediaTypeFor('application/pdf')).toBe('doc');
    expect(mediaTypeFor()).toBe('unknown');
  });

  it('persists uploaded binaries across store restarts', async () => {
    const first = new MediaStore(rootDirectory);
    await first.initialize();

    const created = await first.createBinary({
      buffer: Buffer.from('persistent-media'),
      collection: 'demo',
      mimeType: 'text/plain',
      name: 'note.txt',
      occurrenceKey: 'occurrence-1',
    });

    const second = new MediaStore(rootDirectory);
    await second.initialize();
    expect(second.getFile(created.id, 'demo')).toMatchObject({
      id: created.id,
      collection: 'demo',
      occurrenceKey: 'occurrence-1',
      details: {
        mimeType: 'text/plain',
        name: 'note.txt',
        processingStatus: 'succeeded',
        size: 16,
      },
    });
    await expect(second.binaryStat(created.id)).resolves.toMatchObject({
      size: 16,
    });

    const metadata = JSON.parse(
      await readFile(path.join(rootDirectory, 'metadata.json'), 'utf8'),
    ) as { version: number };
    expect(metadata.version).toBe(1);
  });

  it('assembles bound chunks and removes staging files', async () => {
    const store = new MediaStore(rootDirectory);
    await store.initialize();
    const placeholder = await store.createPlaceholder({
      collection: 'demo',
      id: 'file-1',
      occurrenceKey: 'occurrence-1',
    });
    const upload = store.createUpload();
    await store.putChunk('chunk-1', Buffer.from('hello '));
    await store.putChunk('chunk-2', Buffer.from('world'));
    expect(store.appendUploadChunks(upload.id, ['chunk-1', 'chunk-2'])).toBe(
      true,
    );

    await expect(
      store.finalizeUpload({
        collection: 'demo',
        fileId: placeholder.id,
        mimeType: 'text/plain',
        name: 'greeting.txt',
        uploadId: upload.id,
      }),
    ).resolves.toMatchObject({ details: { size: 11 } });
    await expect(store.hasChunk('chunk-1')).resolves.toBe(false);
    await expect(store.hasChunk('chunk-2')).resolves.toBe(false);
  });

  it('rejects corrupt metadata without replacing it', async () => {
    const metadataPath = path.join(rootDirectory, 'metadata.json');
    await writeFile(metadataPath, '{not-json', 'utf8');
    const store = new MediaStore(rootDirectory);

    await expect(store.initialize()).rejects.toBeInstanceOf(SyntaxError);
    await expect(readFile(metadataPath, 'utf8')).resolves.toBe('{not-json');
  });

  it('rejects identifiers that could escape storage directories', async () => {
    const store = new MediaStore(rootDirectory);
    await store.initialize();

    expect(() => store.binaryPath('../outside')).toThrow(
      'Invalid storage identifier',
    );
    expect(() => store.chunkPath('folder/chunk')).toThrow(
      'Invalid storage identifier',
    );
  });
});
