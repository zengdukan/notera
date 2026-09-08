import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

function readCandidateSvg(candidateName: string): string {
  return readFileSync(
    path.join(candidatesRoot, candidateName, 'icon.svg'),
    'utf8',
  );
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
