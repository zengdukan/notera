import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yauzl from 'yauzl';

import { writeExportEntries } from '../archive-writer';

const entry = (archivePath: string, bytes: readonly number[]) => ({
  archivePath,
  byteLength: bytes.length,
  open: async function* open() {
    yield Uint8Array.from(bytes);
  },
});

function readZip(path: string): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (openError, zip) => {
      if (openError || zip === undefined) {
        reject(openError ?? new Error('zip missing'));
        return;
      }
      const files = new Map<string, Uint8Array>();
      zip.readEntry();
      zip.on('entry', (value) => {
        zip.openReadStream(value, (streamError, stream) => {
          if (streamError || stream === undefined) {
            reject(streamError ?? new Error('stream missing'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(value.fileName, Uint8Array.from(Buffer.concat(chunks)));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.on('error', reject);
    });
  });
}

describe('atomic export writer', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'notera-export-archive-'));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('streams the document and assets into a valid zip', async () => {
    const target = join(root, 'Project.zip');
    const progress: number[] = [];

    await writeExportEntries({
      target,
      packaging: 'ZIP',
      partId: 'id',
      entries: [
        entry('Project.md', [1, 2]),
        entry('assets/photo.png', [3, 4, 5]),
      ],
      signal: new AbortController().signal,
      onBytes: (completed) => progress.push(completed),
    });

    const files = await readZip(target);
    expect([...files.keys()]).toEqual(['Project.md', 'assets/photo.png']);
    expect([...files.get('Project.md')!]).toEqual([1, 2]);
    expect([...files.get('assets/photo.png')!]).toEqual([3, 4, 5]);
    expect(progress.at(-1)).toBe(5);
    expect(await readdir(root)).toEqual(['Project.zip']);
  });

  it('publishes a direct file atomically without leaving a part file', async () => {
    const target = join(root, 'Project.md');
    const progress: Array<readonly [number, number]> = [];

    await writeExportEntries({
      target,
      packaging: 'DIRECT',
      partId: 'id',
      entries: [entry('Project.md', [1, 2, 3])],
      signal: new AbortController().signal,
      onBytes: (completed, total) => progress.push([completed, total]),
    });

    expect([...(await readFile(target))]).toEqual([1, 2, 3]);
    expect(progress).toEqual([[3, 3]]);
    expect(await readdir(root)).toEqual(['Project.md']);
  });

  it('rejects unsafe entries and removes its part file on cancellation', async () => {
    const target = join(root, 'Project.zip');
    const unsafePaths = [
      '../secret.txt',
      '/secret.txt',
      'C:secret.txt',
      'assets\\secret.txt',
      'assets/nested/secret.txt',
    ];
    for (const archivePath of unsafePaths) {
      await expect(
        writeExportEntries({
          target,
          packaging: 'ZIP',
          partId: 'id',
          entries: [entry(archivePath, [1])],
          signal: new AbortController().signal,
          onBytes: () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    }

    const controller = new AbortController();
    controller.abort();
    await expect(
      writeExportEntries({
        target,
        packaging: 'DIRECT',
        partId: 'id',
        entries: [entry('Project.pdf', [1])],
        signal: controller.signal,
        onBytes: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects a byte-length mismatch without publishing a target', async () => {
    const target = join(root, 'Project.pdf');
    for (const byteLength of [1, 3]) {
      await expect(
        writeExportEntries({
          target,
          packaging: 'DIRECT',
          partId: 'id',
          entries: [{ ...entry('Project.pdf', [1, 2]), byteLength }],
          signal: new AbortController().signal,
          onBytes: () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    }
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(root)).toEqual([]);
  });

  it.each([
    ['duplicate entries', [entry('Project.md', [1]), entry('project.MD', [2])]],
    [
      'multiple root documents',
      [entry('Project.md', [1]), entry('Other.md', [2])],
    ],
  ])('rejects %s', async (_label, entries) => {
    await expect(
      writeExportEntries({
        target: join(root, 'Project.zip'),
        packaging: 'ZIP',
        partId: 'id',
        entries,
        signal: new AbortController().signal,
        onBytes: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    expect(await readdir(root)).toEqual([]);
  });

  it.each([
    [
      'reader failure',
      Object.assign(new Error('reader failed'), { code: 'EIO' }),
      'EXPORT_FAILED',
    ],
    [
      'disk full',
      Object.assign(new Error('disk full'), { code: 'ENOSPC' }),
      'DISK_FULL',
    ],
  ])('maps %s and preserves existing files', async (_label, failure, code) => {
    const target = join(root, 'Project.zip');
    const existing = join(root, 'existing.txt');
    await writeFile(existing, 'keep');
    const failedEntry = {
      archivePath: 'Project.md',
      byteLength: 1,
      open: async function* open() {
        throw failure;
      },
    };

    await expect(
      writeExportEntries({
        target,
        packaging: 'ZIP',
        partId: 'id',
        entries: [failedEntry],
        signal: new AbortController().signal,
        onBytes: () => undefined,
      }),
    ).rejects.toMatchObject({ code });

    expect(await readFile(existing, 'utf8')).toBe('keep');
    expect(await readdir(root)).toEqual(['existing.txt']);
  });

  it('aborts during streaming and removes only its part file', async () => {
    const target = join(root, 'Project.pdf');
    const existing = join(root, 'existing.txt');
    await writeFile(existing, 'keep');
    const controller = new AbortController();

    await expect(
      writeExportEntries({
        target,
        packaging: 'DIRECT',
        partId: 'id',
        entries: [
          {
            archivePath: 'Project.pdf',
            byteLength: 2,
            open: async function* open() {
              yield Uint8Array.of(1);
              yield Uint8Array.of(2);
            },
          },
        ],
        signal: controller.signal,
        onBytes: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });

    expect(await readFile(existing, 'utf8')).toBe('keep');
    expect(await readdir(root)).toEqual(['existing.txt']);
  });

  it('aborts a zip during streaming without publishing a target', async () => {
    const target = join(root, 'Project.zip');
    const controller = new AbortController();

    await expect(
      writeExportEntries({
        target,
        packaging: 'ZIP',
        partId: 'id',
        entries: [entry('Project.md', [1, 2])],
        signal: controller.signal,
        onBytes: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });

    expect(await readdir(root)).toEqual([]);
  });

  it('preserves a target created before the final publish', async () => {
    const target = join(root, 'Project.pdf');
    await writeFile(target, 'existing');

    await expect(
      writeExportEntries({
        target,
        packaging: 'DIRECT',
        partId: 'id',
        entries: [entry('Project.pdf', [1, 2])],
        signal: new AbortController().signal,
        onBytes: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });

    expect(await readFile(target, 'utf8')).toBe('existing');
    expect(await readdir(root)).toEqual(['Project.pdf']);
  });
});
