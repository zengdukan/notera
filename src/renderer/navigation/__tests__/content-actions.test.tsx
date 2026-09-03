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
  isFavorite: false,
};

describe('content actions', () => {
  it('assigns an Atlassian icon to every folder and note action', () => {
    const controller = new Proxy({}, { get: () => jest.fn() }) as never;
    const iconNames = (entry: typeof folder | typeof note) =>
      createContentActions(entry, controller).map(({ id, icon }) => [
        id,
        icon.displayName,
      ]);

    expect(iconNames(folder)).toEqual([
      ['create-note', 'NoteIcon'],
      ['create-folder', 'FolderClosedIcon'],
      ['rename', 'EditIcon'],
      ['move', 'ArrowRightIcon'],
      ['trash', 'DeleteIcon'],
    ]);
    expect(iconNames(note)).toEqual([
      ['rename', 'EditIcon'],
      ['move', 'ArrowRightIcon'],
      ['copy', 'CopyIcon'],
      ['toggle-favorite', 'StarUnstarredIcon'],
      ['export', 'DownloadIcon'],
      ['trash', 'DeleteIcon'],
    ]);
  });

  it('uses one ordered action matrix for context and overflow menus', () => {
    const controller = new Proxy({}, { get: () => jest.fn() }) as never;
    expect(actionIdsFor(createContentActions(folder, controller))).toEqual([
      'create-note',
      'create-folder',
      'rename',
      'move',
      'trash',
    ]);
    expect(actionIdsFor(createContentActions(note, controller))).toEqual([
      'rename',
      'move',
      'copy',
      'toggle-favorite',
      'export',
      'trash',
    ]);
    expect(
      actionIdsFor(createContentActions(folder, controller, 'context')),
    ).toEqual(
      actionIdsFor(createContentActions(folder, controller, 'overflow')),
    );
  });

  it('marks the export action for runtime localization', () => {
    const exportAction = createContentActions(note, {
      export: jest.fn(),
    }).find(({ id }) => id === 'export');

    expect(exportAction).toMatchObject({
      label: 'Export',
      messageId: 'export.action',
      isDisabled: false,
    });
  });

  it('labels the favorite action from the note favorite state', () => {
    const toggleFavorite = jest.fn();
    const addAction = createContentActions(note, { toggleFavorite }).find(
      ({ id }) => id === 'toggle-favorite',
    );
    const removeAction = createContentActions(
      { ...note, isFavorite: true },
      { toggleFavorite },
    ).find(({ id }) => id === 'toggle-favorite');

    expect(addAction).toMatchObject({
      label: 'Add to favorites',
      isDisabled: false,
    });
    expect(removeAction).toMatchObject({
      label: 'Remove from favorites',
      isDisabled: false,
    });
    expect(addAction?.icon.displayName).toBe('StarUnstarredIcon');
    expect(removeAction?.icon.displayName).toBe('StarStarredIcon');
  });
});
