const crypto = require('node:crypto');
const babel = require('@babel/core');
const compiledPlugin = require('@compiled/babel-plugin');
const tsJest = require('ts-jest').default;

const tsJestTransformer = tsJest.createTransformer();

function transformWithCompiled(sourceText, sourcePath) {
  if (!sourceText.includes('@atlaskit/css')) {
    return sourceText;
  }

  const result = babel.transformSync(sourceText, {
    filename: sourcePath,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
    plugins: [[compiledPlugin, { importSources: ['@atlaskit/css'] }]],
  });

  return result?.code ?? sourceText;
}

module.exports = {
  process(sourceText, sourcePath, options) {
    return tsJestTransformer.process(
      transformWithCompiled(sourceText, sourcePath),
      sourcePath,
      options,
    );
  },

  getCacheKey(sourceText, sourcePath, options) {
    const delegatedKey = tsJestTransformer.getCacheKey(
      sourceText,
      sourcePath,
      options,
    );

    return crypto
      .createHash('sha1')
      .update(delegatedKey)
      .update('\0compiled-jest-transformer-v1')
      .digest('hex');
  },

  canInstrument: tsJestTransformer.canInstrument,
};
