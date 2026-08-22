const forbiddenDependency = (name, fromPath, toPath) => ({
  name,
  severity: 'error',
  from: { path: fromPath },
  to: { path: toPath },
});

module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    forbiddenDependency(
      'domain-no-project-dependencies',
      '^packages/domain/',
      '^(packages/(crypto|storage-sqlcipher|attachments|application|export)/|src/)',
    ),
    forbiddenDependency(
      'crypto-no-project-dependencies',
      '^packages/crypto/',
      '^(packages/(domain|storage-sqlcipher|attachments|application|export)/|src/)',
    ),
    forbiddenDependency(
      'storage-only-depends-on-domain',
      '^packages/storage-sqlcipher/',
      '^(packages/(crypto|attachments|application|export)/|src/)',
    ),
    forbiddenDependency(
      'attachments-only-depends-on-domain-and-crypto',
      '^packages/attachments/',
      '^(packages/(storage-sqlcipher|application|export)/|src/)',
    ),
    forbiddenDependency(
      'application-does-not-depend-on-desktop',
      '^packages/application/',
      '^src/',
    ),
    forbiddenDependency(
      'application-does-not-depend-on-export',
      '^packages/application/',
      '^packages/export/',
    ),
    forbiddenDependency(
      'export-only-depends-on-domain',
      '^packages/export/',
      '^(packages/(crypto|storage-sqlcipher|attachments|application)/|src/)',
    ),
    forbiddenDependency(
      'shared-no-project-dependencies',
      '^src/shared/',
      '^(packages/|src/(main|renderer)/)',
    ),
    forbiddenDependency(
      'renderer-only-depends-on-shared',
      '^src/renderer/',
      '^(packages/|src/main/)',
    ),
    forbiddenDependency(
      'preload-only-depends-on-shared',
      '^src/main/preload\\.ts$',
      '^(packages/|src/main/|src/renderer/)',
    ),
    forbiddenDependency(
      'main-does-not-depend-on-renderer',
      '^src/main/(?!preload\\.ts$)',
      '^src/renderer/',
    ),
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    enhancedResolveOptions: {
      conditionNames: ['types', 'import', 'require', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    tsPreCompilationDeps: true,
  },
};
