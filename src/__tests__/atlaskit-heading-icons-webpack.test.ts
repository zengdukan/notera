import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import webpack, { type Configuration } from 'webpack';

import baseConfig from '../../.erb/configs/webpack.config.base';

function compile(config: Configuration): Promise<webpack.Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      if (!stats) {
        reject(new Error('Webpack did not return compilation stats.'));
        return;
      }

      resolve(stats);
    });
  });
}

describe('Atlaskit quick-insert heading icons', () => {
  let fixturePath: string;

  beforeEach(() => {
    fixturePath = mkdtempSync(path.join(tmpdir(), 'notera-heading-icons-'));
  });

  afterEach(() => {
    rmSync(fixturePath, { force: true, recursive: true });
  });

  it('emits a loadable chunk for every heading level', async () => {
    const entryPath = path.join(fixturePath, 'entry.js');
    const outputPath = path.join(fixturePath, 'dist');
    mkdirSync(outputPath);
    writeFileSync(
      entryPath,
      "export { IconHeading } from '@atlaskit/editor-common/assets';\n",
      'utf8',
    );

    const stats = await compile({
      ...baseConfig,
      context: process.cwd(),
      devtool: false,
      entry: entryPath,
      mode: 'development',
      output: {
        chunkFilename: '[name].js',
        filename: 'entry.js',
        path: outputPath,
      },
      resolve: {
        ...baseConfig.resolve,
        modules: [path.join(process.cwd(), 'node_modules')],
      },
      target: ['web', 'electron-renderer'],
    });
    const result = stats.toJson({ all: false, assets: true, errors: true });

    expect(result.errors).toEqual([]);

    const assetNames = result.assets?.map(({ name }) => name) ?? [];
    expect(assetNames).toEqual(
      expect.arrayContaining(
        Array.from(
          { length: 6 },
          (_, index) =>
            `@atlaskit-internal_editor-icon-heading-${index + 1}.js`,
        ),
      ),
    );
  }, 30_000);
});
