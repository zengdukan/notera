import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

afterEach(() => cleanupTempRoots());

async function* source(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return result;
}

async function findBlobFile(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      try {
        return await findBlobFile(path);
      } catch {
        // Continue searching sibling directories.
      }
    } else if (entry.isFile() && entry.name.endsWith('.blob')) {
      return path;
    }
  }
  throw new Error('blob not found');
}

async function fixture() {
  const appDataRoot = tempRoot();
  const manager = await createProfileManager({ appDataRoot });
  const unlocked = await manager.createProfile({
    displayName: 'Attachments',
    password: 'correct horse battery staple',
  });
  const note = await manager.localNotes.createNote({
    folderId: unlocked.rootFolderId,
    title: 'With files',
  });
  return { appDataRoot, manager, note };
}

describe('LocalAttachmentsService reader', () => {
  it('streams safe attachment content and maps conservative previews', async () => {
    const { manager, note } = await fixture();
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const image = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'image.png',
      mimeType: 'image/png',
      source: source(bytes),
    });
    const html = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'unsafe.html',
      mimeType: 'text/html',
      source: source(new Uint8Array([60, 62])),
    });

    const reader = await manager.localAttachments.openReader(image.id);
    expect(reader).toMatchObject({
      attachmentId: image.id,
      fileName: 'image.png',
      mimeType: 'image/png',
      byteLength: bytes.byteLength,
    });
    expect(reader).not.toHaveProperty('blobId');
    expect(reader).not.toHaveProperty('fileKey');
    expect(reader).not.toHaveProperty('manifest');
    await expect(collect(reader.stream())).resolves.toEqual(bytes);
    await expect(collect(reader.streamRange(5, 13))).resolves.toEqual(
      bytes.slice(5, 13),
    );
    await reader.close();
    await reader.close();

    const listed = await manager.localAttachments.listForNote({
      noteId: note.id,
      limit: 10,
    });
    expect(listed.items.find(({ id }) => id === image.id)).toMatchObject({
      localState: 'AVAILABLE',
      previewable: true,
    });
    expect(listed.items.find(({ id }) => id === html.id)).toMatchObject({
      localState: 'AVAILABLE',
      previewable: false,
    });
    await manager.close();
  });

  it('marks a missing blob without exposing its path', async () => {
    const { appDataRoot, manager, note } = await fixture();
    const attachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'missing.bin',
      mimeType: 'application/octet-stream',
      source: source(new Uint8Array([1, 2, 3])),
    });
    const blobPath = await findBlobFile(join(appDataRoot, 'profiles'));
    await unlink(blobPath);

    await expect(
      manager.localAttachments.openReader(attachment.id),
    ).rejects.toMatchObject({ code: 'BLOB_MISSING' });
    await expect(
      manager.localAttachments.openReader(attachment.id),
    ).rejects.not.toThrow(blobPath);
    const listed = await manager.localAttachments.listForNote({
      noteId: note.id,
      limit: 10,
    });
    expect(listed.items[0].localState).toBe('MISSING');
    await manager.close();
  });

  it('marks ciphertext corruption after a stream failure', async () => {
    const { appDataRoot, manager, note } = await fixture();
    const attachment = await manager.localAttachments.importAttachment({
      noteId: note.id,
      fileName: 'corrupt.bin',
      mimeType: 'application/octet-stream',
      source: source(new Uint8Array([1, 2, 3, 4])),
    });
    const blobPath = await findBlobFile(join(appDataRoot, 'profiles'));
    const ciphertext = await readFile(blobPath);
    await writeFile(blobPath, new Uint8Array(ciphertext.byteLength));

    const reader = await manager.localAttachments.openReader(attachment.id);
    await expect(collect(reader.stream())).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await reader.close();
    const listed = await manager.localAttachments.listForNote({
      noteId: note.id,
      limit: 10,
    });
    expect(listed.items[0].localState).toBe('CORRUPT');
    await manager.close();
  });
});
