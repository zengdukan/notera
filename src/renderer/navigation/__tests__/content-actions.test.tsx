import { actionIdsFor, createContentActions } from '../content-actions';

const folder = {
  kind: 'folder' as const,
  id: 'folder',
  name: 'Folder',
  parentId: 'root',
  updatedAt: 1,
  hasChildren: true,
};
const note = {
  kind: 'note' as const,
  id: 'note',
  title: 'Note',
  folderId: 'root',
  contentVersion: 1,
  updatedAt: 1,
};

describe('content actions', () => {
  it('uses one ordered action matrix for context and overflow menus', () => {
    const controller = new Proxy({}, { get: () => jest.fn() }) as never;
    expect(actionIdsFor(createContentActions(folder, controller))).toEqual([
      'open',
      'create-note',
      'create-folder',
      'rename',
      'move',
      'trash',
    ]);
    expect(actionIdsFor(createContentActions(note, controller))).toEqual([
      'open',
      'rename',
      'move',
      'copy',
      'toggle-favorite',
      'export',
      'trash',
    ]);
    expect(actionIdsFor(createContentActions(folder, controller, 'context'))).toEqual(
      actionIdsFor(createContentActions(folder, controller, 'overflow')),
    );
  });
});
