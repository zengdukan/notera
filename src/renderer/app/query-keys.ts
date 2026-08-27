const profilePrefix = (profileId: string) => ['profile', profileId] as const;

export const treeKey = (profileId: string, folderId: string) =>
  [...profilePrefix(profileId), 'tree', folderId] as const;

export const noteKey = (profileId: string, noteId: string) =>
  [...profilePrefix(profileId), 'note', noteId] as const;

export const folderPathKey = (profileId: string, folderId: string) =>
  [...profilePrefix(profileId), 'path', folderId] as const;

export const folderPathsKey = (profileId: string) =>
  [...profilePrefix(profileId), 'path'] as const;

export const searchKey = (
  profileId: string,
  query: string,
  folderId?: string,
) =>
  [
    ...profilePrefix(profileId),
    'search',
    query,
    ...(folderId === undefined ? [] : [folderId]),
  ] as const;

export const searchesKey = (profileId: string) =>
  [...profilePrefix(profileId), 'search'] as const;

export const favoritesKey = (profileId: string) =>
  [...profilePrefix(profileId), 'favorites'] as const;

export const recentKey = (profileId: string) =>
  [...profilePrefix(profileId), 'recent'] as const;

export const historyKey = (profileId: string, noteId: string) =>
  [...profilePrefix(profileId), 'history', noteId] as const;

export const historySnapshotKey = (
  profileId: string,
  noteId: string,
  versionId: string,
) => [...historyKey(profileId, noteId), 'version', versionId] as const;

export const trashKey = (profileId: string) =>
  [...profilePrefix(profileId), 'trash'] as const;

export const profileSettingsKey = (profileId: string) =>
  [...profilePrefix(profileId), 'settings'] as const;
