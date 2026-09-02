export interface FolderPathItem {
  readonly name: string;
}

export function formatFolderPath(
  folderPath: readonly FolderPathItem[],
): string {
  const childNames = folderPath
    .slice(1)
    .map((item) => item.name)
    .filter((name) => name.length > 0);

  return childNames.length === 0 ? '/' : `/ ${childNames.join(' / ')}`;
}
