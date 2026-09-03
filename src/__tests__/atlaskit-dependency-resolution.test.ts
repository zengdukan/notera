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
  '@atlaskit/afm-i18n-platform-editor-renderer': '2.200.0',
  '@atlaskit/afm-i18n-platform-elements-task-decision': '2.200.0',
  '@atlaskit/afm-i18n-platform-media-media-ui': '2.200.0',
  '@atlaskit/app-provider': '^5.4.0',
  '@atlaskit/avatar': '^27.2.1',
  '@atlaskit/breadcrumbs': '^17.6.1',
  '@atlaskit/button': '^25.0.4',
  '@atlaskit/css': '^1.1.0',
  '@atlaskit/css-reset': '^8.1.3',
  '@atlaskit/dropdown-menu': '^18.0.3',
  '@atlaskit/editor-common': '^119.0.0',
  '@atlaskit/editor-core': '^224.0.0',
  '@atlaskit/editor-plugin-show-diff': '^13.0.1',
  '@atlaskit/editor-toolbar': '^2.6.8',
  '@atlaskit/editor-prosemirror': '^8.0.3',
  '@atlaskit/emoji': '^71.17.0',
  '@atlaskit/empty-state': '^12.1.0',
  '@atlaskit/flag': '^18.4.0',
  '@atlaskit/form': '^17.1.1',
  '@atlaskit/heading': '^7.1.0',
  '@atlaskit/icon': '^37.3.0',
  '@atlaskit/image': '^5.0.0',
  '@atlaskit/link-provider': '^5.3.0',
  '@atlaskit/media-core': '^38.0.0',
  '@atlaskit/menu': '^10.1.0',
  '@atlaskit/modal-dialog': '^16.5.3',
  '@atlaskit/navigation-system': '^10.16.3',
  '@atlaskit/platform-feature-flags': '^2.1.1',
  '@atlaskit/popup': '^6.2.1',
  '@atlaskit/primitives': '^22.4.0',
  '@atlaskit/prosemirror-input-rules': '^4.0.44',
  '@atlaskit/radio': '^10.1.0',
  '@atlaskit/renderer': '^136.0.0',
  '@atlaskit/section-message': '^10.1.0',
  '@atlaskit/select': '^22.10.0',
  '@atlaskit/side-nav-items': '^2.3.12',
  '@atlaskit/skeleton': '^4.3.0',
  '@atlaskit/spinner': '^20.3.0',
  '@atlaskit/tabs': '^21.1.0',
  '@atlaskit/textarea': '^10.0.0',
  '@atlaskit/textfield': '^10.1.0',
  '@atlaskit/tile': '^4.1.0',
  '@atlaskit/tokens': '^16.7.0',
  '@atlaskit/tooltip': '^24.0.8',
  '@atlaskit/util-service-support': '^6.3.3',
  '@atlaskit/visually-hidden': '^4.4.0',
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
