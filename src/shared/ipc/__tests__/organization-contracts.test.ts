import { ipcFailure } from '../common';
import { batchContracts } from '../contracts/batch';
import { favoriteContracts } from '../contracts/favorite';
import {
  historyContracts,
  versionRefSchema,
} from '../contracts/history';
import { searchContracts, searchResultSchema } from '../contracts/search';
import { tagContracts } from '../contracts/tag';
import { trashContracts, trashItemSchema } from '../contracts/trash';

const uuid = (suffix: number) =>
  `10000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('organization contract catalog', () => {
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

    for (const contract of listRequests) {
      expect(contract.request.safeParse({ limit: 10 }).success).toBe(
        contract === tagContracts.list ||
          contract === favoriteContracts.list ||
          contract === trashContracts.list,
      );
    }
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
        kind: 'SYSTEM_PROTECTION',
      }).success,
    ).toBe(false);
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
      deletedAt: 10,
      expiresAt: 20,
      originalParentAvailable: false,
    };

    expect(trashItemSchema.parse({ ...base, kind: 'folder' })).toBeDefined();
    expect(trashItemSchema.parse({ ...base, kind: 'note' })).toBeDefined();
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
    updatedAt: 1,
    highlights: [
      { field: 'title' as const, start: 1, end: 2 },
      { field: 'excerpt' as const, start: 0, end: 2 },
    ],
  };

  it('accepts ordered code-point highlight ranges', () => {
    expect(searchResultSchema.parse(validResult)).toEqual(validResult);
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
    expect(() => searchResultSchema.parse({ ...validResult, rowId: 7 }))
      .toThrow();
  });
});
