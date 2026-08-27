import type { NoteraClient } from '../../platform/notera-client';
import {
  disabledFolderIdsFor,
  loadFolderPickerItems,
} from '../folder-picker-data';

describe('folder picker data', () => {
  it('loads paginated folders recursively in tree order and ignores notes', async () => {
    const request = jest.fn(
      async (
        _key: string,
        input: { parentFolderId: string; cursor?: string },
      ) => {
        if (input.parentFolderId === 'root' && input.cursor === undefined) {
          return {
            items: [
              {
                kind: 'folder',
                id: 'a',
                name: 'A',
                parentId: 'root',
                updatedAt: 1,
                hasChildren: true,
              },
              {
                kind: 'note',
                id: 'note',
                title: 'Note',
                folderId: 'root',
                contentVersion: 1,
                updatedAt: 1,
              },
            ],
            nextCursor: 'page-2',
          };
        }
        if (input.parentFolderId === 'root') {
          return {
            items: [
              {
                kind: 'folder',
                id: 'b',
                name: 'B',
                parentId: 'root',
                updatedAt: 1,
                hasChildren: false,
              },
            ],
            nextCursor: null,
          };
        }
        return {
          items: [
            {
              kind: 'folder',
              id: 'a-child',
              name: 'A child',
              parentId: 'a',
              updatedAt: 1,
              hasChildren: false,
            },
          ],
          nextCursor: null,
        };
      },
    );

    const folders = await loadFolderPickerItems(
      { request } as unknown as NoteraClient,
      'root',
    );

    expect(folders).toEqual([
      { id: 'a', name: 'A', parentId: 'root', depth: 0 },
      { id: 'a-child', name: 'A child', parentId: 'a', depth: 1 },
      { id: 'b', name: 'B', parentId: 'root', depth: 0 },
    ]);
    expect(request).toHaveBeenCalledWith('contentTree.listChildren', {
      parentFolderId: 'root',
      limit: 100,
      cursor: 'page-2',
    });
  });

  it('disables a moved folder and its descendants but not unrelated folders', () => {
    const folders = [
      { id: 'a', name: 'A', parentId: 'root', depth: 0 },
      { id: 'a-child', name: 'A child', parentId: 'a', depth: 1 },
      { id: 'b', name: 'B', parentId: 'root', depth: 0 },
    ];

    expect(disabledFolderIdsFor({ kind: 'folder', id: 'a' }, folders)).toEqual(
      new Set(['a', 'a-child']),
    );
    expect(disabledFolderIdsFor({ kind: 'note', id: 'note' }, folders)).toEqual(
      new Set(),
    );
  });
});
