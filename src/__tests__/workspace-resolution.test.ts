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
  ])('resolves the @notera/%s public entry point', (_name, workspacePackage) => {
    expect(workspacePackage).toBeDefined();
  });
});
