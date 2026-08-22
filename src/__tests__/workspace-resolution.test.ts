import * as application from '@notera/application';
import * as attachments from '@notera/attachments';
import * as crypto from '@notera/crypto';
import * as domain from '@notera/domain';
import * as storageSqlcipher from '@notera/storage-sqlcipher';

describe('workspace package resolution', () => {
  test.each([
    ['application', application],
    ['attachments', attachments],
    ['crypto', crypto],
    ['domain', domain],
    ['storage-sqlcipher', storageSqlcipher],
  ])(
    'resolves the @notera/%s public entry point',
    (_name, workspacePackage) => {
      expect(workspacePackage).toBeDefined();
    },
  );

  it('exposes storage integrity through the package without native internals', () => {
    expect(
      storageSqlcipher.VaultDatabase.prototype.checkIntegrity,
    ).toBeInstanceOf(Function);
    expect(
      (storageSqlcipher as Record<string, unknown>).openNativeConnection,
    ).toBeUndefined();
    expect(
      (storageSqlcipher as Record<string, unknown>).CURRENT_SCHEMA_SQL,
    ).toBeUndefined();
    expect(
      (storageSqlcipher as Record<string, unknown>).runMigrations,
    ).toBeUndefined();
  });
});
