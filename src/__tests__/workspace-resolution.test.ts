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

  it('exposes attachment storage without filesystem or crypto internals', () => {
    expect(attachments.createAttachmentStore).toBeInstanceOf(Function);
    expect(attachments.ATTACHMENT_CHUNK_BYTES).toBe(5 * 1024 * 1024);
    expect(attachments.ATTACHMENT_MANIFEST_VERSION).toBe(1);
    expect(attachments.MAX_ATTACHMENT_BYTES).toBe(500 * 1024 * 1024);
    expect(domain.MAX_ATTACHMENT_BYTES).toBe(500 * 1024 * 1024);
    const attachmentApi = attachments as Record<string, unknown>;
    expect(attachmentApi.encodeManifestV1).toBeUndefined();
    expect(attachmentApi.deriveBlobPath).toBeUndefined();
    expect(attachmentApi.BlobLeaseRegistry).toBeUndefined();
    expect(attachmentApi.encryptAead).toBeUndefined();
  });

  it('exposes only the safe application lifecycle entry point', () => {
    expect(application.createProfileManager).toBeInstanceOf(Function);
    expect(application.ApplicationError).toBeInstanceOf(Function);
    const applicationApi = application as Record<string, unknown>;
    expect(applicationApi.ProfileSession).toBeUndefined();
    expect(applicationApi.ProfileCatalog).toBeUndefined();
    expect(applicationApi.VaultMetaStore).toBeUndefined();
    expect(applicationApi.createApplicationPaths).toBeUndefined();
    expect(applicationApi.createVaultDatabase).toBeUndefined();
    expect(applicationApi.createAttachmentStore).toBeUndefined();
  });
});
