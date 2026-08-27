import type { NoteraClient } from '../platform/notera-client';
import type { FolderPickerItem } from './FolderPicker';

export interface LoadedFolderPickerItem extends FolderPickerItem {
  readonly parentId: string;
}

export async function loadFolderPickerItems(
  client: NoteraClient,
  rootFolderId: string,
): Promise<readonly LoadedFolderPickerItem[]> {
  const loadChildren = async (
    parentFolderId: string,
    depth: number,
  ): Promise<readonly LoadedFolderPickerItem[]> => {
    const children: Array<{
      readonly item: LoadedFolderPickerItem;
      readonly hasChildren: boolean;
    }> = [];
    let cursor: string | undefined;
    do {
      const page = await client.request('contentTree.listChildren', {
        parentFolderId,
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      children.push(
        ...page.items
          .filter(
            (
              entry,
            ): entry is Extract<
              (typeof page.items)[number],
              { kind: 'folder' }
            > => entry.kind === 'folder',
          )
          .map((folder) => ({
            item: {
              id: folder.id,
              name: folder.name,
              parentId: folder.parentId,
              depth,
            },
            hasChildren: folder.hasChildren,
          })),
      );
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    const result: LoadedFolderPickerItem[] = [];
    for (const folder of children) {
      result.push(folder.item);
      if (folder.hasChildren) {
        result.push(...(await loadChildren(folder.item.id, depth + 1)));
      }
    }
    return result;
  };

  return loadChildren(rootFolderId, 0);
}

export function disabledFolderIdsFor(
  entry: { readonly kind: 'folder' | 'note'; readonly id: string },
  folders: readonly LoadedFolderPickerItem[],
): ReadonlySet<string> {
  if (entry.kind === 'note') return new Set();
  const disabled = new Set([entry.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (disabled.has(folder.parentId) && !disabled.has(folder.id)) {
        disabled.add(folder.id);
        changed = true;
      }
    }
  }
  return disabled;
}
