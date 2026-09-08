import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const candidatesRoot = process.env.NOTERA_ICON_CANDIDATES_ROOT
  ? path.resolve(process.env.NOTERA_ICON_CANDIDATES_ROOT)
  : path.join(repositoryRoot, 'assets', 'icon-candidates');
const checkMode = process.argv.includes('--check');
const candidateNames = [
  'vault-n',
  'folded-n',
  'sealed-note',
  'locked-notebook',
];
const candidateLabels = {
  'vault-n': ['01', 'Vault N', 'vault door + monogram'],
  'folded-n': ['02', 'Folded N', 'folded note + seal'],
  'sealed-note': ['03', 'Sealed Note', 'shield + private page'],
  'locked-notebook': ['04', 'Locked Notebook', 'notebook + lock clasp'],
};
const exportSizes = [1024, 256, 64, 32, 16];

async function renderPng(svg, size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function imageElement(svg, x, y, size) {
  const source = Buffer.from(svg).toString('base64');
  return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/svg+xml;base64,${source}" />`;
}

function buildContactSheetSvg(svgSources) {
  const columns = candidateNames.map((name, index) => {
    const x = 64 + index * 574;
    const [number, title, description] = candidateLabels[name];
    const source = svgSources.get(name);
    const previewSizes = [128, 64, 32, 16];
    const previewLabels = ['256', '64', '32', '16'];
    const previewOffsets = [62, 238, 342, 414];
    const previewRow = (y) =>
      previewSizes
        .map((size, previewIndex) => {
          const previewX = x + previewOffsets[previewIndex];
          const imageY = y + 66 + (128 - size) / 2;
          const labelX = previewX + size / 2;
          return `${imageElement(source, previewX, imageY, size)}
            <text x="${labelX}" y="${y + 216}" text-anchor="middle" class="size-label">${previewLabels[previewIndex]} px</text>`;
        })
        .join('\n');

    return `
      <g>
        <rect x="${x}" y="140" width="550" height="1196" rx="40" fill="#FFFFFF" />
        <text x="${x + 44}" y="205" class="number">${number}</text>
        <text x="${x + 112}" y="205" class="title">${xmlEscape(title)}</text>
        <text x="${x + 44}" y="249" class="description">${xmlEscape(description)}</text>
        ${imageElement(source, x + 95, 294, 360)}
        <text x="${x + 44}" y="708" class="section-label">LIGHT UI</text>
        <rect x="${x + 40}" y="730" width="470" height="248" rx="28" fill="#F7F8F9" stroke="#DCDFE4" stroke-width="2" />
        ${previewRow(730)}
        <text x="${x + 44}" y="1040" class="section-label">DARK UI</text>
        <rect x="${x + 40}" y="1062" width="470" height="248" rx="28" fill="#172B4D" />
        ${previewRow(1062)}
      </g>`;
  });

  return `<svg width="2400" height="1400" viewBox="0 0 2400 1400" xmlns="http://www.w3.org/2000/svg">
    <style>
      text { font-family: Arial, sans-serif; fill: #172B4D; }
      .heading { font-size: 48px; font-weight: 700; }
      .subtitle { font-size: 22px; fill: #44546F; }
      .number { font-size: 22px; font-weight: 700; fill: #0C66E4; }
      .title { font-size: 28px; font-weight: 700; }
      .description { font-size: 18px; fill: #626F86; }
      .section-label { font-size: 16px; font-weight: 700; letter-spacing: 2px; fill: #44546F; }
      .size-label { font-size: 14px; fill: #626F86; }
    </style>
    <rect width="2400" height="1400" fill="#F1F2F4" />
    <text x="64" y="70" class="heading">Notera App Icon Candidates</text>
    <text x="64" y="108" class="subtitle">Local-first notes, protected like a private vault</text>
    ${columns.join('\n')}
  </svg>`;
}

async function buildArtifacts() {
  const artifacts = [];
  const svgSources = new Map();

  for (const name of candidateNames) {
    const svg = await readFile(path.join(candidatesRoot, name, 'icon.svg'), 'utf8');
    svgSources.set(name, svg);

    for (const size of exportSizes) {
      artifacts.push({
        relativePath: path.join(name, `icon-${size}.png`),
        contents: await renderPng(Buffer.from(svg), size),
      });
    }
  }

  const contactSheetSvg = buildContactSheetSvg(svgSources);
  artifacts.push({
    relativePath: 'contact-sheet.png',
    contents: await sharp(Buffer.from(contactSheetSvg))
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer(),
  });

  return artifacts;
}

async function findStaleArtifacts(artifacts) {
  const stale = [];

  for (const artifact of artifacts) {
    try {
      const committed = await readFile(
        path.join(candidatesRoot, artifact.relativePath),
      );
      if (!committed.equals(artifact.contents)) {
        stale.push(artifact.relativePath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      stale.push(artifact.relativePath);
    }
  }

  return stale;
}

async function writeArtifacts(artifacts) {
  for (const artifact of artifacts) {
    const outputPath = path.join(candidatesRoot, artifact.relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, artifact.contents);
  }
}

const artifacts = await buildArtifacts();

if (checkMode) {
  const stale = await findStaleArtifacts(artifacts);
  if (stale.length > 0) {
    console.error(
      `Stale icon candidate exports:\n${stale.map((file) => `- ${file.replaceAll('\\', '/')}`).join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log('Icon candidate exports are current.');
  }
} else {
  await writeArtifacts(artifacts);
  console.log(`Exported ${artifacts.length} icon candidate assets.`);
}
