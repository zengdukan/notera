import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { appBuilderPath } = require('app-builder-bin');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const assetsRoot = path.join(repositoryRoot, 'assets');
const candidatesRoot = path.join(assetsRoot, 'icon-candidates');
const activeIconsRoot = path.join(assetsRoot, 'icons');
const candidateNames = new Set([
  'vault-n',
  'folded-n',
  'sealed-note',
  'locked-notebook',
]);
const activeSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 96, 128, 256];
const selectedCandidate = process.argv[2];

if (!candidateNames.has(selectedCandidate)) {
  console.error(
    `Choose one icon candidate: ${[...candidateNames].join(', ')}`,
  );
  process.exit(1);
}

const sourceSvg = await readFile(
  path.join(candidatesRoot, selectedCandidate, 'icon.svg'),
);
const renderedPngs = new Map();

for (const size of activeSizes) {
  const png = await sharp(sourceSvg, { density: 384 })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  renderedPngs.set(size, png);
  await writeFile(path.join(activeIconsRoot, `${size}x${size}.png`), png);
}

await writeFile(path.join(assetsRoot, 'icon.svg'), sourceSvg);
await writeFile(path.join(assetsRoot, 'icon.png'), renderedPngs.get(256));
await writeFile(path.join(assetsRoot, 'icon.ico'), buildIco(renderedPngs));

execFileSync(
  appBuilderPath,
  [
    'icon',
    '--format',
    'icns',
    '--root',
    repositoryRoot,
    '--out',
    assetsRoot,
    '--input',
    path.join('assets', 'icons'),
  ],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

console.log(`Activated the ${selectedCandidate} application icon.`);

function buildIco(pngs) {
  const directory = Buffer.alloc(6 + icoSizes.length * 16);
  const payloads = [];
  let payloadOffset = directory.length;

  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(icoSizes.length, 4);

  for (const [index, size] of icoSizes.entries()) {
    const png = pngs.get(size);
    const entryOffset = 6 + index * 16;

    directory[entryOffset] = size === 256 ? 0 : size;
    directory[entryOffset + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(png.length, entryOffset + 8);
    directory.writeUInt32LE(payloadOffset, entryOffset + 12);
    payloads.push(png);
    payloadOffset += png.length;
  }

  return Buffer.concat([directory, ...payloads]);
}
