import { ipcFailure } from '../common';
import {
  contentTreeContracts,
  treeEntrySummarySchema,
} from '../contracts/content-tree';
import { noteContracts, noteDetailSchema } from '../contracts/note';
import {
  profileContracts,
  profileSummarySchema,
  sessionStateSchema,
} from '../contracts/profile';

const ids = {
  profile: '10000000-0000-4000-8000-000000000001',
  root: '10000000-0000-4000-8000-000000000002',
  folder: '10000000-0000-4000-8000-000000000003',
  note: '10000000-0000-4000-8000-000000000004',
  tag: '10000000-0000-4000-8000-000000000005',
  trash: '10000000-0000-4000-8000-000000000006',
};

const emptyDocument = { type: 'doc' as const, version: 1 as const };

describe('profile IPC contracts', () => {
  it('defines all fixed profile channels', () => {
    expect(
      Object.values(profileContracts).map((contract) => contract.channel),
    ).toEqual([
      'notera:profile:list',
      'notera:profile:get-session-state',
      'notera:profile:create',
      'notera:profile:unlock',
      'notera:profile:lock',
      'notera:profile:switch',
      'notera:profile:rename',
      'notera:profile:change-password',
      'notera:profile:remove-from-device',
    ]);
  });

  it('creates an unlocked session without returning password or key material', () => {
    const session = {
      state: 'UNLOCKED' as const,
      localProfileId: ids.profile,
      displayName: 'Personal',
      rootFolderId: ids.root,
    };

    expect(
      profileContracts.create.request.parse({
        displayName: 'Personal',
        password: ' unchanged password ',
      }),
    ).toEqual({
      displayName: 'Personal',
      password: ' unchanged password ',
    });
    expect(
      profileContracts.create.response.parse({ ret: true, data: session }),
    ).toEqual({ ret: true, data: session });
    expect(() =>
      profileContracts.create.response.parse({
        ret: true,
        data: { ...session, password: 'leak' },
      }),
    ).toThrow();
    expect(() =>
      profileContracts.create.response.parse({
        ret: true,
        data: { ...session, vaultKey: 'leak' },
      }),
    ).toThrow();
  });

  it('limits passwords to the four intended request contracts', () => {
    const requestsWithPassword = Object.entries(profileContracts)
      .filter(([, contract]) => {
        const result = contract.request.safeParse({ password: 'secret' });
        return result.success;
      })
      .map(([name]) => name);

    expect(requestsWithPassword).toEqual([]);
    expect(
      profileContracts.unlock.request.safeParse({
        localProfileId: ids.profile,
        password: 'secret',
      }).success,
    ).toBe(true);
    expect(
      profileContracts.switch.request.safeParse({
        localProfileId: ids.profile,
        password: 'secret',
      }).success,
    ).toBe(true);
    expect(
      profileContracts.changePassword.request.safeParse({
        oldPassword: 'old',
        newPassword: 'new',
      }).success,
    ).toBe(true);
  });

  it('validates profile pages, session states and safe errors', () => {
    const summary = {
      localProfileId: ids.profile,
      displayName: 'Personal',
      lastUsedAt: 1,
      isCurrent: false,
    };

    expect(profileSummarySchema.parse(summary)).toEqual(summary);
    expect(sessionStateSchema.parse({ state: 'LOCKED' })).toEqual({
      state: 'LOCKED',
    });
    expect(
      profileContracts.list.response.parse({
        ret: true,
        data: { items: [summary] },
      }),
    ).toBeDefined();
    expect(
      profileContracts.unlock.response.parse(ipcFailure('WRONG_PASSWORD')),
    ).toEqual(ipcFailure('WRONG_PASSWORD'));
    expect(() =>
      profileContracts.unlock.response.parse(ipcFailure('FOLDER_CYCLE')),
    ).toThrow();
  });
});

describe('content tree IPC contracts', () => {
  it('defines all fixed content tree channels', () => {
    expect(
      Object.values(contentTreeContracts).map((contract) => contract.channel),
    ).toEqual([
      'notera:content-tree:list-children',
      'notera:content-tree:create-folder',
      'notera:content-tree:rename-folder',
      'notera:content-tree:move-folder',
      'notera:content-tree:trash-folder',
    ]);
  });

  it('uses a strict discriminated union for lazy-loaded tree entries', () => {
    const folder = {
      kind: 'folder' as const,
      id: ids.folder,
      name: 'Folder',
      parentId: ids.root,
      updatedAt: 1,
      hasChildren: true,
    };
    const note = {
      kind: 'note' as const,
      id: ids.note,
      title: 'Note',
      folderId: ids.folder,
      contentVersion: 1,
      updatedAt: 1,
    };

    expect(treeEntrySummarySchema.parse(folder)).toEqual(folder);
    expect(treeEntrySummarySchema.parse(note)).toEqual(note);
    expect(() =>
      treeEntrySummarySchema.parse({ ...folder, title: 'mixed' }),
    ).toThrow();
    expect(() =>
      treeEntrySummarySchema.parse({ ...note, document: emptyDocument }),
    ).toThrow();
    expect(
      contentTreeContracts.listChildren.request.parse({
        parentFolderId: ids.root,
        limit: 100,
        sort: { field: 'TITLE', direction: 'ASC' },
      }),
    ).toEqual({
      parentFolderId: ids.root,
      limit: 100,
      sort: { field: 'TITLE', direction: 'ASC' },
    });
    expect(
      contentTreeContracts.listChildren.request.parse({
        parentFolderId: ids.root,
        limit: 100,
      }),
    ).toEqual({ parentFolderId: ids.root, limit: 100 });
    expect(() =>
      treeEntrySummarySchema.parse({ ...folder, sortOrder: 0 }),
    ).toThrow();
  });

  it('accepts only the fixed automatic sort options', () => {
    const { request } = contentTreeContracts.listChildren;
    const fields = ['CREATED_AT', 'UPDATED_AT', 'TITLE'] as const;
    const directions = ['ASC', 'DESC'] as const;
    fields.forEach((field) => {
      directions.forEach((direction) => {
        expect(
          request.safeParse({
            parentFolderId: ids.root,
            limit: 20,
            sort: { field, direction },
          }).success,
        ).toBe(true);
      });
    });
    expect(
      request.safeParse({
        parentFolderId: ids.root,
        limit: 20,
        sort: { field: 'SORT_ORDER', direction: 'ASC' },
      }).success,
    ).toBe(false);
    expect(
      request.safeParse({
        parentFolderId: ids.root,
        limit: 20,
        sort: { field: 'TITLE', direction: 'NEWEST' },
      }).success,
    ).toBe(false);
  });
});

describe('note IPC contracts', () => {
  it('defines all fixed note channels', () => {
    expect(
      Object.values(noteContracts).map((contract) => contract.channel),
    ).toEqual([
      'notera:note:create',
      'notera:note:get',
      'notera:note:save-draft',
      'notera:note:move',
      'notera:note:copy',
      'notera:note:trash',
      'notera:note:list-recent',
    ]);
  });

  it('requires expected content version when saving a draft', () => {
    const request = {
      noteId: ids.note,
      expectedContentVersion: 1,
      title: 'Draft',
      document: emptyDocument,
    };

    expect(noteContracts.saveDraft.request.parse(request)).toEqual(request);
    expect(
      noteContracts.saveDraft.request.safeParse({
        noteId: ids.note,
        title: 'Draft',
        document: emptyDocument,
      }).success,
    ).toBe(false);
    expect(
      noteContracts.saveDraft.response.parse({
        ret: true,
        data: { noteId: ids.note, contentVersion: 2, savedAt: 2 },
      }),
    ).toBeDefined();
    expect(
      noteContracts.saveDraft.response.parse(
        ipcFailure('CONTENT_VERSION_CONFLICT'),
      ),
    ).toEqual(ipcFailure('CONTENT_VERSION_CONFLICT'));
  });

  it('returns strict note details without vault or database identifiers', () => {
    const detail = {
      kind: 'note' as const,
      id: ids.note,
      title: 'Note',
      folderId: ids.folder,
      document: emptyDocument,
      contentVersion: 1,
      createdAt: 1,
      updatedAt: 1,
      tags: [{ id: ids.tag, name: 'tag', updatedAt: 1 }],
    };

    expect(noteDetailSchema.parse(detail)).toEqual(detail);
    expect(() => noteDetailSchema.parse({ ...detail, rowId: 12 })).toThrow();
    expect(() =>
      noteDetailSchema.parse({ ...detail, vaultId: ids.profile }),
    ).toThrow();
    expect(
      noteContracts.listRecent.request.parse({ cursor: 'next', limit: 20 }),
    ).toEqual({ cursor: 'next', limit: 20 });
  });
});
