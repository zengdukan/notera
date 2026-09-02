import { ipcFailure } from '../common';
import { batchContracts } from '../contracts/batch';
import { contentTreeContracts } from '../contracts/content-tree';
import { favoriteContracts } from '../contracts/favorite';
import { historyContracts, versionRefSchema } from '../contracts/history';
import { noteContracts } from '../contracts/note';
import { searchContracts, searchResultSchema } from '../contracts/search';
import { tagContracts } from '../contracts/tag';
import { trashContracts, trashItemSchema } from '../contracts/trash';

const uuid = (suffix: number) =>
  `10000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('organization contract catalog', () => {
  it('defines strict folder path and note rename contracts without ADF', () => {
    expect(
      contentTreeContracts.getFolderPath.request.parse({ folderId: uuid(1) }),
    ).toEqual({ folderId: uuid(1) });
    const path = {
      items: [
        { id: uuid(1), name: '' },
        { id: uuid(2), name: 'Projects' },
      ],
    };
    expect(contentTreeContracts.getFolderPath.data.parse(path)).toEqual(path);
    const renamed = {
      kind: 'note',
      id: uuid(3),
      title: 'Renamed',
      folderId: uuid(2),
      contentVersion: 2,
      updatedAt: 3,
    };
    expect(
      noteContracts.rename.request.parse({ noteId: uuid(3), title: 'Renamed' }),
    ).toEqual({ noteId: uuid(3), title: 'Renamed' });
    expect(noteContracts.rename.data.parse(renamed)).toEqual(renamed);
    expect(
      noteContracts.rename.data.safeParse({ ...renamed, document: {} }).success,
    ).toBe(false);
  });

  it('defines all fixed organization, history, trash and search channels', () => {
    const channels = [
      ...Object.values(tagContracts),
      ...Object.values(favoriteContracts),
      ...Object.values(batchContracts),
      ...Object.values(historyContracts),
      ...Object.values(trashContracts),
      ...Object.values(searchContracts),
    ].map((contract) => contract.channel);

    expect(channels).toEqual([
      'notera:tag:list',
      'notera:tag:create',
      'notera:tag:rename',
      'notera:tag:delete',
      'notera:tag:add-to-note',
      'notera:tag:remove-from-note',
      'notera:favorite:list',
      'notera:favorite:add',
      'notera:favorite:remove',
      'notera:favorite:reorder',
      'notera:batch:move',
      'notera:batch:add-tags',
      'notera:batch:remove-tags',
      'notera:batch:copy',
      'notera:batch:trash',
      'notera:history:list',
      'notera:history:get',
      'notera:history:create-permanent',
      'notera:history:rename',
      'notera:history:compare',
      'notera:history:restore',
      'notera:history:copy',
      'notera:trash:list',
      'notera:trash:restore',
      'notera:trash:delete-permanent',
      'notera:trash:purge-expired',
      'notera:search:query',
    ]);
  });

  it('uses cursor pagination for every unbounded list', () => {
    const listRequests = [
      tagContracts.list,
      favoriteContracts.list,
      historyContracts.list,
      trashContracts.list,
      searchContracts.query,
    ];

    listRequests.forEach((contract) => {
      expect(contract.request.safeParse({ limit: 10 }).success).toBe(
        contract === tagContracts.list ||
          contract === favoriteContracts.list ||
          contract === trashContracts.list,
      );
    });
    expect(
      historyContracts.list.request.safeParse({ noteId: uuid(1), limit: 10 })
        .success,
    ).toBe(true);
    expect(
      searchContracts.query.request.safeParse({ query: '笔记', limit: 10 })
        .success,
    ).toBe(true);
  });
});

describe('tag, favorite and batch contracts', () => {
  it('keeps idempotent relation operations strict', () => {
    expect(
      tagContracts.addToNote.request.parse({ noteId: uuid(1), tagId: uuid(2) }),
    ).toEqual({ noteId: uuid(1), tagId: uuid(2) });
    expect(
      favoriteContracts.add.response.parse({ ret: true, data: {} }),
    ).toEqual({ ret: true, data: {} });
    expect(() =>
      favoriteContracts.add.response.parse({
        ret: true,
        data: { alreadyExisted: true },
      }),
    ).toThrow();
  });

  it('accepts 500 unique batch targets and rejects empty, oversized or duplicate targets', () => {
    const targets = Array.from({ length: 500 }, (_, index) => ({
      kind: 'note' as const,
      id: uuid(index + 1),
    }));

    expect(
      batchContracts.move.request.safeParse({
        targets,
        targetFolderId: uuid(900),
      }).success,
    ).toBe(true);
    expect(
      batchContracts.move.request.safeParse({
        targets: [],
        targetFolderId: uuid(900),
      }).success,
    ).toBe(false);
    expect(
      batchContracts.move.request.safeParse({
        targets: [...targets, { kind: 'note', id: uuid(700) }],
        targetFolderId: uuid(900),
      }).success,
    ).toBe(false);
    expect(
      batchContracts.move.request.safeParse({
        targets: [targets[0], targets[0]],
        targetFolderId: uuid(900),
      }).success,
    ).toBe(false);
  });

  it('does not expose partial success for batch mutations', () => {
    expect(
      batchContracts.trash.response.parse({
        ret: true,
        data: { trashEntryIds: [uuid(1), uuid(2)] },
      }),
    ).toBeDefined();
    expect(() =>
      batchContracts.trash.response.parse({
        ret: true,
        data: { trashEntryIds: [uuid(1)], failures: [uuid(2)] },
      }),
    ).toThrow();
  });
});

describe('history and trash contracts', () => {
  it('allows current/version comparisons but does not let callers forge protection versions', () => {
    expect(versionRefSchema.parse({ source: 'CURRENT' })).toEqual({
      source: 'CURRENT',
    });
    expect(
      versionRefSchema.parse({ source: 'VERSION', versionId: uuid(2) }),
    ).toEqual({ source: 'VERSION', versionId: uuid(2) });
    expect(
      historyContracts.createPermanent.request.safeParse({
        noteId: uuid(1),
        versionName: '  发布前  ',
      }).success,
    ).toBe(true);
    expect(
      historyContracts.rename.request.parse({
        noteId: uuid(1),
        versionId: uuid(2),
        versionName: null,
      }),
    ).toEqual({ noteId: uuid(1), versionId: uuid(2), versionName: null });
    expect(
      historyContracts.createPermanent.response.safeParse({
        ret: true,
        data: {
          versionId: uuid(2),
          noteId: uuid(1),
          kind: 'SYSTEM_PROTECTION',
          protectionReason: 'BEFORE_MIGRATION',
          versionName: null,
          displayTitle: 'Snapshot',
          createdAt: 1,
        },
      }).success,
    ).toBe(true);
  });

  it('requires expected content version for history restore', () => {
    expect(
      historyContracts.restore.request.safeParse({
        noteId: uuid(1),
        versionId: uuid(2),
        expectedContentVersion: 3,
      }).success,
    ).toBe(true);
    expect(
      historyContracts.restore.request.safeParse({
        noteId: uuid(1),
        versionId: uuid(2),
      }).success,
    ).toBe(false);
    expect(
      historyContracts.restore.response.parse(
        ipcFailure('CONTENT_VERSION_CONFLICT'),
      ),
    ).toEqual(ipcFailure('CONTENT_VERSION_CONFLICT'));
  });

  it('uses strict folder/note trash item variants and explicit restore targets', () => {
    const base = {
      trashEntryId: uuid(1),
      objectId: uuid(2),
      displayName: 'Deleted',
      folderPath: [
        { id: uuid(3), name: '' },
        { id: uuid(4), name: 'Archive' },
      ],
      deletedAt: 10,
      expiresAt: 20,
      originalParentAvailable: false,
    };

    expect(trashItemSchema.parse({ ...base, kind: 'folder' })).toBeDefined();
    expect(trashItemSchema.parse({ ...base, kind: 'note' })).toBeDefined();
    expect(
      trashItemSchema.safeParse({
        ...base,
        kind: 'note',
        folderPath: undefined,
      }).success,
    ).toBe(false);
    expect(() =>
      trashItemSchema.parse({ ...base, kind: 'note', document: {} }),
    ).toThrow();
    expect(
      trashContracts.restore.request.parse({
        trashEntryId: uuid(1),
        targetFolderId: uuid(3),
      }),
    ).toBeDefined();
    expect(
      trashContracts.restore.response.parse(
        ipcFailure('TRASH_TARGET_REQUIRED'),
      ),
    ).toEqual(ipcFailure('TRASH_TARGET_REQUIRED'));
  });
});

describe('search contract', () => {
  const validResult = {
    noteId: uuid(1),
    title: 'A😀B',
    excerpt: '中文内容',
    folderPath: [
      { id: uuid(2), name: '' },
      { id: uuid(3), name: 'Projects' },
    ],
    updatedAt: 1,
    highlights: [
      { field: 'title' as const, start: 1, end: 2 },
      { field: 'excerpt' as const, start: 0, end: 2 },
    ],
  };

  it('accepts ordered code-point highlight ranges', () => {
    expect(searchResultSchema.parse(validResult)).toEqual(validResult);
  });

  it('accepts an optional folder subtree scope', () => {
    expect(
      searchContracts.query.request.parse({
        query: 'roadmap',
        folderId: uuid(2),
        limit: 10,
      }),
    ).toEqual({ query: 'roadmap', folderId: uuid(2), limit: 10 });
    expect(
      searchContracts.query.request.safeParse({
        query: 'roadmap',
        folderId: 'not-a-uuid',
        limit: 10,
      }).success,
    ).toBe(false);
  });

  it('rejects empty queries, query internals and invalid highlights', () => {
    expect(
      searchContracts.query.request.safeParse({ query: '', limit: 10 }).success,
    ).toBe(false);
    expect(
      searchContracts.query.request.safeParse({
        query: 'note',
        limit: 10,
        ftsExpression: '*',
      }).success,
    ).toBe(false);
    expect(() =>
      searchResultSchema.parse({
        ...validResult,
        highlights: [{ field: 'title', start: 2, end: 4 }],
      }),
    ).toThrow();
    expect(() =>
      searchResultSchema.parse({
        ...validResult,
        highlights: [
          { field: 'excerpt', start: 0, end: 2 },
          { field: 'title', start: 0, end: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      searchResultSchema.parse({ ...validResult, rowId: 7 }),
    ).toThrow();
  });
});
