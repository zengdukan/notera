import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import CopyIcon from '@atlaskit/icon/core/copy';
import DeleteIcon from '@atlaskit/icon/core/delete';
import DownloadIcon from '@atlaskit/icon/core/download';
import EditIcon from '@atlaskit/icon/core/edit';
import FolderClosedIcon from '@atlaskit/icon/core/folder-closed';
import NoteIcon from '@atlaskit/icon/core/note';
import StarStarredIcon from '@atlaskit/icon/core/star-starred';
import StarUnstarredIcon from '@atlaskit/icon/core/star-unstarred';

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
  readonly icon: typeof EditIcon;
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
  anchor: 'context' | 'overflow' = 'overflow',
): readonly ContentAction[] {
  void anchor;
  const action = (
    id: ContentActionId,
    label: string,
    icon: typeof EditIcon,
    run: (() => unknown) | undefined,
  ): ContentAction =>
    Object.freeze({
      id,
      label,
      icon,
      run: () => run?.(),
      isDisabled: run === undefined,
    });
  const rename = action(
    'rename',
    'Rename',
    EditIcon,
    controller.rename ? () => controller.rename?.(entry) : undefined,
  );
  const move = action(
    'move',
    'Move',
    ArrowRightIcon,
    controller.openMove ? () => controller.openMove?.(entry) : undefined,
  );
  const trash = action(
    'trash',
    'Move to trash',
    DeleteIcon,
    controller.openTrash ? () => controller.openTrash?.(entry) : undefined,
  );
  if (entry.kind === 'folder') {
    return Object.freeze([
      action(
        'create-note',
        'Create note',
        NoteIcon,
        controller.createNote
          ? () => controller.createNote?.(entry.id)
          : undefined,
      ),
      action(
        'create-folder',
        'Create subfolder',
        FolderClosedIcon,
        controller.openCreateFolder
          ? () => controller.openCreateFolder?.(entry)
          : undefined,
      ),
      rename,
      move,
      trash,
    ]);
  }
  return Object.freeze([
    rename,
    move,
    action(
      'copy',
      'Copy',
      CopyIcon,
      controller.openCopy ? () => controller.openCopy?.(entry) : undefined,
    ),
    action(
      'toggle-favorite',
      entry.isFavorite ? 'Remove from favorites' : 'Add to favorites',
      entry.isFavorite ? StarStarredIcon : StarUnstarredIcon,
      controller.toggleFavorite
        ? () => controller.toggleFavorite?.(entry)
        : undefined,
    ),
    action(
      'export',
      'Export',
      DownloadIcon,
      controller.export ? () => controller.export?.(entry) : undefined,
    ),
    trash,
  ]);
}

export const actionIdsFor = (actions: readonly ContentAction[]) =>
  actions.map(({ id }) => id);
