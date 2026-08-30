const headingImportPattern =
  /_tsRewriteRelativeImportExtensions\((["']\.\/heading[1-6]["'])\)/g;

module.exports = function fixAtlaskitHeadingIcons(source) {
  let replacementCount = 0;
  const transformedSource = source.replace(
    headingImportPattern,
    (_match, request) => {
      replacementCount += 1;
      return request;
    },
  );

  if (replacementCount !== 0 && replacementCount !== 6) {
    throw new Error(
      `Expected to rewrite all 6 Atlaskit heading imports, but rewrote ${replacementCount}.`,
    );
  }

  return transformedSource;
};
