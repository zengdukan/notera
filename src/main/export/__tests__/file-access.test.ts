import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createExportFileAccess } from '../file-access';

const source = (bytes: readonly number[]) => async function* stream() {
  yield Uint8Array.from(bytes);
};

describe('export file access', () => {
  let root: string;
  let selectedPath: string | null;
  let dialogInput: unknown;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'notera-export-files-'));
    selectedPath = null;
    dialogInput = undefined;
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const create = () =>
    createExportFileAccess({
      dialogs: {
        chooseExportPath: async (input) => {
          dialogInput = input;
          return selectedPath;
        },
      },
      randomUUID: () => '10000000-0000-4000-8000-000000000001',
    });

  it('returns null when the user cancels', async () => {
    await expect(
      create().choose({
        suggestedBaseName: 'Report',
        format: 'PDF',
        packaging: 'DIRECT',
      }),
    ).resolves.toBeNull();
    expect(dialogInput).toEqual({
      suggestedName: 'Report.pdf',
      extension: 'pdf',
    });
    expect(await readdir(root)).toEqual([]);
  });

  it('allocates a non-overwriting target and publishes a direct file', async () => {
    selectedPath = join(root, 'Report.pdf');
    await writeFile(join(root, 'REPORT.PDF'), 'old');
    const selection = await create().choose({
      suggestedBaseName: 'Report',
      format: 'PDF',
      packaging: 'DIRECT',
    });
    if (selection === null) throw new Error('selection missing');

    expect(selection.baseName).toBe('Report (2)');
    await selection.write({
      entries: [
        {
          archivePath: 'Report (2).pdf',
          byteLength: 3,
          open: source([1, 2, 3]),
        },
      ],
      signal: new AbortController().signal,
      onBytes: () => undefined,
    });

    expect(await readFile(join(root, 'REPORT.PDF'), 'utf8')).toBe('old');
    expect([...(await readFile(join(root, 'Report (2).pdf')))]).toEqual([
      1, 2, 3,
    ]);
    expect((await readdir(root)).sort()).toEqual([
      'REPORT.PDF',
      'Report (2).pdf',
    ]);
  });

  it.each([
    {
      format: 'MARKDOWN' as const,
      packaging: 'DIRECT' as const,
      selected: 'Chosen.md',
      extension: 'md' as const,
    },
    {
      format: 'PDF' as const,
      packaging: 'ZIP' as const,
      selected: 'Chosen.zip',
      extension: 'zip' as const,
    },
  ])(
    'forces the .$extension output for $format/$packaging',
    async ({ format, packaging, selected, extension }) => {
      selectedPath = join(root, selected);

      const selection = await create().choose({
        suggestedBaseName: 'Suggested',
        format,
        packaging,
      });

      expect(dialogInput).toEqual({
        suggestedName: `Suggested.${extension}`,
        extension,
      });
      expect(selection).toMatchObject({
        baseName: 'Chosen',
        packaging,
      });
    },
  );

  it('uses a single extension when the selected base name is empty', async () => {
    selectedPath = join(root, '...pdf');

    const selection = await create().choose({
      suggestedBaseName: '',
      format: 'PDF',
      packaging: 'DIRECT',
    });

    expect(selection?.baseName).toBe('未命名笔记');
  });
});
