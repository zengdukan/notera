import { createProfileManager } from '../manager';
import { cleanupTempRoots, tempRoot } from './helpers';

const document = (text: string) => ({
  type: 'doc' as const,
  version: 1 as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

afterEach(() => cleanupTempRoots());

describe('LocalNotesService search and session integration', () => {
  it('searches vault/folder scopes without retaining a locked or switched vault', async () => {
    const manager = await createProfileManager({ appDataRoot: tempRoot() });
    const first = await manager.createProfile({
      displayName: 'First',
      password: 'correct horse battery staple',
    });
    const service = manager.localNotes;
    const folder = await service.createFolder({
      parentFolderId: first.rootFolderId,
      name: 'Scoped',
    });
    const inside = await service.createNote({
      folderId: folder.id,
      title: 'Inside needle',
    });
    const outside = await service.createNote({
      folderId: first.rootFolderId,
      title: 'Outside',
    });
    await service.saveDraft({
      noteId: inside.id,
      title: inside.title,
      document: document('needle body'),
    });
    await service.saveDraft({
      noteId: outside.id,
      title: outside.title,
      document: document('needle body'),
    });

    const vault = await service.search({ query: 'needle', limit: 1 });
    expect(vault.items).toHaveLength(1);
    expect(vault.nextCursor).toEqual(expect.any(String));
    expect(vault.items[0].highlights.length).toBeGreaterThan(0);
    await expect(
      service.search({
        query: 'different',
        limit: 1,
        cursor: vault.nextCursor,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    const scoped = await service.search({
      query: 'needle',
      folderId: folder.id,
      limit: 10,
    });
    expect(scoped.items.map(({ noteId }) => noteId)).toEqual([inside.id]);
    expect(scoped.items[0].folderPath).toEqual([
      { id: first.rootFolderId, name: '' },
      { id: folder.id, name: 'Scoped' },
    ]);

    await service.trashFolder(folder.id);
    await expect(
      service.search({ query: 'needle', folderId: folder.id, limit: 10 }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });

    await manager.lockProfile();
    expect(manager.localNotes).toBe(service);
    const locked = service.search({ query: 'secret phrase', limit: 10 });
    await expect(locked).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
    await expect(locked).rejects.not.toThrow(/secret phrase/u);

    const second = await manager.createProfile({
      displayName: 'Second',
      password: 'another correct horse battery staple',
    });
    expect(manager.localNotes).toBe(service);
    await expect(
      service.search({ query: 'needle', limit: 10 }),
    ).resolves.toEqual({ items: [] });
    const current = await service.createNote({
      folderId: second.rootFolderId,
      title: 'Current needle',
    });
    const pending = service.search({ query: 'needle', limit: 10 });
    const closing = manager.close();
    await expect(pending).resolves.toMatchObject({
      items: [expect.objectContaining({ noteId: current.id })],
    });
    await closing;
    await expect(
      service.search({ query: 'needle', limit: 10 }),
    ).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
  }, 60_000);

  it('keeps internal database and feature functions out of the package root', () => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const publicApi = require('../index') as Record<string, unknown>;
    expect(publicApi.createProfileManager).toBeInstanceOf(Function);
    expect(publicApi.ApplicationError).toBeInstanceOf(Function);
    expect(publicApi.ProfileSession).toBeUndefined();
    expect(publicApi.VaultDatabase).toBeUndefined();
    expect(publicApi.createLocalNotesService).toBeUndefined();
    expect(publicApi.createLocalAttachmentsService).toBeUndefined();
    expect(publicApi.recoverAttachments).toBeUndefined();
    expect(publicApi.search).toBeUndefined();
  });
});
