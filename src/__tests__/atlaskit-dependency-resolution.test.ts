import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type PackageLockEntry = {
  dependencies?: Record<string, string>;
  version?: string;
};

type PackageLock = {
  packages: Record<string, PackageLockEntry>;
};

const expectedAtlaskitDependencies = {
  '@atlaskit/adf-schema': '^56.7.3',
  '@atlaskit/button': '^25.0.4',
  '@atlaskit/css-reset': '^8.1.3',
  '@atlaskit/dropdown-menu': '^18.0.3',
  '@atlaskit/editor-common': '^119.0.0',
  '@atlaskit/editor-core': '^224.0.0',
  '@atlaskit/editor-prosemirror': '^8.0.3',
  '@atlaskit/emoji': '^71.17.0',
  '@atlaskit/icon': '^37.3.0',
  '@atlaskit/link-provider': '^5.3.0',
  '@atlaskit/media-core': '^38.0.0',
  '@atlaskit/modal-dialog': '^16.3.4',
  '@atlaskit/platform-feature-flags': '^2.1.1',
  '@atlaskit/prosemirror-input-rules': '^4.0.44',
  '@atlaskit/renderer': '^136.0.0',
  '@atlaskit/textarea': '^10.0.0',
  '@atlaskit/tokens': '^16.7.0',
  '@atlaskit/tooltip': '^24.0.8',
  '@atlaskit/util-service-support': '^6.3.3',
};

describe('Atlaskit dependency resolution', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const packageLock = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8'),
  ) as PackageLock;

  it('keeps the demo dependency declarations aligned with the source project', () => {
    const actualAtlaskitDependencies = Object.fromEntries(
      Object.entries(packageJson.dependencies).filter(([name]) =>
        name.startsWith('@atlaskit/'),
      ),
    );

    expect(actualAtlaskitDependencies).toEqual(expectedAtlaskitDependencies);
  });

  it('uses the source project schema and collaboration dependency closure', () => {
    const adfSchemaCopies = Object.entries(packageLock.packages).filter(
      ([packagePath, entry]) =>
        packagePath.endsWith('node_modules/@atlaskit/adf-schema') &&
        entry.version,
    );
    const collaborationPackage =
      packageLock.packages['node_modules/@atlaskit/prosemirror-collab'];

    expect(adfSchemaCopies.map(([, entry]) => entry.version)).toEqual([
      '56.7.3',
    ]);
    expect(collaborationPackage).toMatchObject({
      version: '1.0.44',
      dependencies: {
        '@atlaskit/adf-schema': '^56.7.0',
      },
    });
  });

  it('provides the Immer peer used by the Atlaskit Media state store', () => {
    const projectRequire = createRequire(
      path.join(process.cwd(), 'package.json'),
    );
    const zustandRequire = createRequire(
      projectRequire.resolve('zustand/package.json'),
    );
    const immerPackage = zustandRequire('immer/package.json') as {
      version: string;
    };

    expect(immerPackage.version).toBe('9.0.21');
  });
});
