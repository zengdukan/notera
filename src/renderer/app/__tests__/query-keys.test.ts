import {
  favoritesKey,
  folderPathKey,
  historyKey,
  noteKey,
  profileSettingsKey,
  recentKey,
  searchKey,
  trashKey,
  treeKey,
} from '../query-keys';

const profileId = 'profile-a';

describe('profile query keys', () => {
  it('prefixes every persisted profile query with the profile identifier', () => {
    const keys = [
      treeKey(profileId, 'folder-a'),
      noteKey(profileId, 'note-a'),
      folderPathKey(profileId, 'folder-a'),
      searchKey(profileId, 'find me'),
      searchKey(profileId, 'find me', 'folder-a'),
      favoritesKey(profileId),
      recentKey(profileId),
      historyKey(profileId, 'note-a'),
      trashKey(profileId),
      profileSettingsKey(profileId),
    ];

    keys.forEach((key) => expect(key.slice(0, 2)).toEqual(['profile', profileId]));
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
  });
});
