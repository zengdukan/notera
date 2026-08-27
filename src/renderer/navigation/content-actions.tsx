import type { ContentEntry } from './content-controller';

export type ContentActionId =
  | 'open'
  | 'create-note'
  | 'create-folder'
  | 'rename'
  | 'move'
  | 'copy'
  | 'toggle-favorite'
  | 'export'
  | 'trash';

export interface ContentAction {
  readonly id: ContentActionId;
  readonly label: string;
  readonly isDisabled: boolean;
  run(): unknown;
}

interface ActionController {
  readonly open?: (entry: ContentEntry) => unknown;
  readonly createNote?: (folderId: string) => unknown;
  readonly openCreateFolder?: (entry: ContentEntry) => unknown;
  readonly rename?: (entry: ContentEntry) => unknown;
  readonly openMove?: (entry: ContentEntry) => unknown;
  readonly openCopy?: (entry: ContentEntry) => unknown;
  readonly toggleFavorite?: (entry: ContentEntry) => unknown;
  readonly export?: (entry: ContentEntry) => unknown;
  readonly openTrash?: (entry: ContentEntry) => unknown;
}

export function createContentActions(
  entry: ContentEntry,
  controller: ActionController,
  _anchor: 'context' | 'overflow' = 'overflow',
): readonly ContentAction[] {
  const action = (
    id: ContentActionId,
    label: string,
    run: (() => unknown) | undefined,
  ): ContentAction => Object.freeze({
    id,
    label,
    run: () => run?.(),
    isDisabled: run === undefined,
  });
  const open = action('open', 'Open', controller.open ? () => controller.open?.(entry) : undefined);
  const rename = action('rename', 'Rename', controller.rename ? () => controller.rename?.(entry) : undefined);
  const move = action('move', 'Move', controller.openMove ? () => controller.openMove?.(entry) : undefined);
  const trash = action('trash', 'Move to trash', controller.openTrash ? () => controller.openTrash?.(entry) : undefined);
  if (entry.kind === 'folder') {
    return Object.freeze([
      open,
      action('create-note', 'Create note', controller.createNote ? () => controller.createNote?.(entry.id) : undefined),
      action('create-folder', 'Create subfolder', controller.openCreateFolder ? () => controller.openCreateFolder?.(entry) : undefined),
      rename,
      move,
      trash,
    ]);
  }
  return Object.freeze([
    open,
    rename,
    move,
    action('copy', 'Copy', controller.openCopy ? () => controller.openCopy?.(entry) : undefined),
    action('toggle-favorite', 'Add to favorites', controller.toggleFavorite ? () => controller.toggleFavorite?.(entry) : undefined),
    action('export', 'Export', controller.export ? () => controller.export?.(entry) : undefined),
    trash,
  ]);
}

export const actionIdsFor = (actions: readonly ContentAction[]) =>
  actions.map(({ id }) => id);
