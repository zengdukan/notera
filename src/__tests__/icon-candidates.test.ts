import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appBuilderPath } from 'app-builder-bin';
import sharp from 'sharp';

const candidatesRoot = path.join(
  process.cwd(),
  'assets',
  'icon-candidates',
);
const candidateNames = [
  'vault-n',
  'folded-n',
  'sealed-note',
  'locked-notebook',
] as const;
const allowedColors = new Set(['#0c66e4', '#1558bc', '#172b4d', '#f7f8f9']);
const exportedSizes = [1024, 256, 64, 32, 16] as const;
const activeIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024] as const;

function readCandidateSvg(candidateName: string): string {
  return readFileSync(
    path.join(candidatesRoot, candidateName, 'icon.svg'),
    'utf8',
  );
}

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

describe('Notera icon candidate masters', () => {
  it('contains exactly the four planned candidates', () => {
    const directories = readdirSync(candidatesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toEqual([...candidateNames].sort());
  });

  it.each(candidateNames)('%s uses the shared self-contained SVG contract', (name) => {
    const source = readCandidateSvg(name);
    const colors = source.match(/#[0-9a-f]{6}/giu) ?? [];

    expect(source).toMatch(
      /^<svg[^>]+width="1024"[^>]+height="1024"[^>]+viewBox="0 0 1024 1024"/u,
    );
    expect(source).toContain('data-safe-margin="96"');
    expect(source.match(/<linearGradient\b/gu) ?? []).toHaveLength(1);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.every((color) => allowedColors.has(color.toLowerCase()))).toBe(
      true,
    );
    expect(source).not.toMatch(/<(?:text|image|filter|foreignObject)\b/iu);
    expect(source).not.toMatch(/(?:href|src)="(?:https?:|data:|\/\/)/iu);
    expect(source).not.toMatch(/(?:font-family|blur\s*\()/iu);
  });

  it('keeps every candidate visually distinct at the source level', () => {
    const hashes = candidateNames.map((name) =>
      createHash('sha256').update(readCandidateSvg(name)).digest('hex'),
    );

    expect(new Set(hashes).size).toBe(candidateNames.length);
  });
});

describe('Notera icon candidate exports', () => {
  it.each(candidateNames)('%s has every required transparent PNG size', async (name) => {
    for (const size of exportedSizes) {
      const metadata = await sharp(
        path.join(candidatesRoot, name, `icon-${size}.png`),
      ).metadata();

      expect(metadata).toEqual(
        expect.objectContaining({
          width: size,
          height: size,
          format: 'png',
          hasAlpha: true,
        }),
      );
    }
  });

  it('exports the planned comparison board dimensions', async () => {
    const metadata = await sharp(
      path.join(candidatesRoot, 'contact-sheet.png'),
    ).metadata();

    expect(metadata).toEqual(
      expect.objectContaining({ width: 2400, height: 1400, format: 'png' }),
    );
  });

  it('reports committed exports as current', () => {
    const result = runExportCheck(candidatesRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Icon candidate exports are current.');
  });

  it('reports exports as stale when a master changes', () => {
    const temporaryRoot = mkdtempSync(
      path.join(tmpdir(), 'notera-icon-candidates-'),
    );

    try {
      cpSync(candidatesRoot, temporaryRoot, { recursive: true });
      const changedMaster = path.join(temporaryRoot, 'vault-n', 'icon.svg');
      const source = readFileSync(changedMaster, 'utf8');
      writeFileSync(
        changedMaster,
        source.replace('stop-color="#0C66E4"', 'stop-color="#1558BC"'),
      );

      const result = runExportCheck(temporaryRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Stale icon candidate exports:');
      expect(result.stderr).toContain('vault-n/icon-1024.png');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('active Notera application icon', () => {
  const selectedCandidateRoot = path.join(candidatesRoot, 'sealed-note');
  const activeIconsRoot = path.join(process.cwd(), 'assets', 'icons');

  it('uses Sealed Note as its editable master', () => {
    expect(hashFile(path.join(process.cwd(), 'assets', 'icon.svg'))).toBe(
      hashFile(path.join(selectedCandidateRoot, 'icon.svg')),
    );
  });

  it.each(activeIconSizes)('provides a transparent %d px application PNG', async (size) => {
    const metadata = await sharp(
      path.join(activeIconsRoot, `${size}x${size}.png`),
    ).metadata();

    expect(metadata).toEqual(
      expect.objectContaining({
        width: size,
        height: size,
        format: 'png',
        hasAlpha: true,
      }),
    );
  });

  it('keeps the generic application PNG aligned with the selected candidate', () => {
    const selectedPng = path.join(selectedCandidateRoot, 'icon-256.png');

    expect(hashFile(path.join(process.cwd(), 'assets', 'icon.png'))).toBe(
      hashFile(selectedPng),
    );
    expect(hashFile(path.join(activeIconsRoot, '256x256.png'))).toBe(
      hashFile(selectedPng),
    );
  });

  it('packages every Windows-native size in the active ICO', () => {
    const ico = readFileSync(path.join(process.cwd(), 'assets', 'icon.ico'));
    const entryCount = ico.readUInt16LE(4);
    const entries = Array.from({ length: entryCount }, (_, index) => {
      const entryOffset = 6 + index * 16;
      const size = ico[entryOffset] || 256;
      const payloadLength = ico.readUInt32LE(entryOffset + 8);
      const payloadOffset = ico.readUInt32LE(entryOffset + 12);

      return {
        size,
        payload: ico.subarray(payloadOffset, payloadOffset + payloadLength),
      };
    });

    expect(entries.map((entry) => entry.size)).toEqual([
      16, 24, 32, 48, 64, 96, 128, 256,
    ]);
    for (const entry of entries) {
      expect(
        createHash('sha256').update(entry.payload).digest('hex'),
      ).toBe(hashFile(path.join(activeIconsRoot, `${entry.size}x${entry.size}.png`)));
    }
  });

  it('keeps the ICNS artifact reproducible from the active PNG set', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'notera-platform-icons-'));

    try {
      const result = spawnSync(
        appBuilderPath,
        [
          'icon',
          '--format',
          'icns',
          '--root',
          process.cwd(),
          '--out',
          temporaryRoot,
          '--input',
          path.join('assets', 'icons'),
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(hashFile(path.join(temporaryRoot, 'icon.icns'))).toBe(
        hashFile(path.join(process.cwd(), 'assets', 'icon.icns')),
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function runExportCheck(root: string) {
  return spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'export-icon-candidates.mjs'), '--check'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NOTERA_ICON_CANDIDATES_ROOT: root,
      },
    },
  );
}
