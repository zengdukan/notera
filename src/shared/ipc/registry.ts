import {
  attachmentGetPreviewUrl,
  attachmentListForNote,
  attachmentRemoveFromNote,
  attachmentStartImport,
  attachmentStartSaveAs,
} from './contracts/attachment';
import { appCloseRequested, appCompleteClose } from './contracts/app';
import {
  batchAddTags,
  batchCopy,
  batchMove,
  batchRemoveTags,
  batchTrash,
} from './contracts/batch';
import {
  contentTreeCreateFolder,
  contentTreeGetFolderPath,
  contentTreeListChildren,
  contentTreeMoveFolder,
  contentTreeRenameFolder,
  contentTreeTrashFolder,
} from './contracts/content-tree';
import { exportStartNote } from './contracts/export';
import {
  favoriteAdd,
  favoriteList,
  favoriteRemove,
  favoriteReorder,
} from './contracts/favorite';
import {
  historyCompare,
  historyCopy,
  historyCreatePermanent,
  historyGet,
  historyList,
  historyRename,
  historyRestore,
} from './contracts/history';
import {
  noteCopy,
  noteCreate,
  noteGet,
  noteListRecent,
  noteMove,
  noteRename,
  noteSaveDraft,
  noteTrash,
} from './contracts/note';
import {
  operationCancel,
  operationCompleted,
  operationGetStatus,
  operationProgress,
  profileLocked,
} from './contracts/operation';
import {
  profileChangePassword,
  profileCreate,
  profileGetSessionState,
  profileList,
  profileLock,
  profileRemoveFromDevice,
  profileRename,
  profileSwitch,
  profileTouchActivity,
  profileUnlock,
} from './contracts/profile';
import { searchQuery } from './contracts/search';
import {
  settingsGetDevice,
  settingsGetProfile,
  settingsUpdateDevice,
  settingsUpdateProfile,
} from './contracts/settings';
import {
  tagAddToNote,
  tagCreate,
  tagDelete,
  tagList,
  tagRemoveFromNote,
  tagRename,
} from './contracts/tag';
import {
  trashDeletePermanent,
  trashList,
  trashPurgeExpired,
  trashRestore,
} from './contracts/trash';

export const requestContracts = {
  'profile.list': profileList,
  'profile.getSessionState': profileGetSessionState,
  'profile.create': profileCreate,
  'profile.unlock': profileUnlock,
  'profile.lock': profileLock,
  'profile.touchActivity': profileTouchActivity,
  'profile.switch': profileSwitch,
  'profile.rename': profileRename,
  'profile.changePassword': profileChangePassword,
  'profile.removeFromDevice': profileRemoveFromDevice,
  'contentTree.listChildren': contentTreeListChildren,
  'contentTree.getFolderPath': contentTreeGetFolderPath,
  'contentTree.createFolder': contentTreeCreateFolder,
  'contentTree.renameFolder': contentTreeRenameFolder,
  'contentTree.moveFolder': contentTreeMoveFolder,
  'contentTree.trashFolder': contentTreeTrashFolder,
  'note.create': noteCreate,
  'note.get': noteGet,
  'note.rename': noteRename,
  'note.saveDraft': noteSaveDraft,
  'note.move': noteMove,
  'note.copy': noteCopy,
  'note.trash': noteTrash,
  'note.listRecent': noteListRecent,
  'tag.list': tagList,
  'tag.create': tagCreate,
  'tag.rename': tagRename,
  'tag.delete': tagDelete,
  'tag.addToNote': tagAddToNote,
  'tag.removeFromNote': tagRemoveFromNote,
  'favorite.list': favoriteList,
  'favorite.add': favoriteAdd,
  'favorite.remove': favoriteRemove,
  'favorite.reorder': favoriteReorder,
  'batch.move': batchMove,
  'batch.addTags': batchAddTags,
  'batch.removeTags': batchRemoveTags,
  'batch.copy': batchCopy,
  'batch.trash': batchTrash,
  'history.list': historyList,
  'history.get': historyGet,
  'history.createPermanent': historyCreatePermanent,
  'history.rename': historyRename,
  'history.compare': historyCompare,
  'history.restore': historyRestore,
  'history.copy': historyCopy,
  'trash.list': trashList,
  'trash.restore': trashRestore,
  'trash.deletePermanent': trashDeletePermanent,
  'trash.purgeExpired': trashPurgeExpired,
  'search.query': searchQuery,
  'attachment.listForNote': attachmentListForNote,
  'attachment.startImport': attachmentStartImport,
  'attachment.removeFromNote': attachmentRemoveFromNote,
  'attachment.getPreviewUrl': attachmentGetPreviewUrl,
  'attachment.startSaveAs': attachmentStartSaveAs,
  'export.startNote': exportStartNote,
  'operation.getStatus': operationGetStatus,
  'operation.cancel': operationCancel,
  'settings.getDevice': settingsGetDevice,
  'settings.updateDevice': settingsUpdateDevice,
  'settings.getProfile': settingsGetProfile,
  'settings.updateProfile': settingsUpdateProfile,
  'app.completeClose': appCompleteClose,
} as const;

export const eventContracts = {
  'profile.locked': profileLocked,
  'operation.progress': operationProgress,
  'operation.completed': operationCompleted,
  'app.closeRequested': appCloseRequested,
} as const;

interface RegistryEntry {
  readonly key: string;
  readonly channel: string;
}

function assertRegistry(): void {
  const entries = [
    ...(Object.entries(requestContracts) as [string, RegistryEntry][]),
    ...(Object.entries(eventContracts) as [string, RegistryEntry][]),
  ];
  const channels = new Set<string>();
  const channelPattern = /^notera:[a-z0-9-]+:[a-z0-9-]+$/;

  entries.forEach(([key, contract]) => {
    if (
      key !== contract.key ||
      !channelPattern.test(contract.channel) ||
      channels.has(contract.channel)
    ) {
      throw new Error('The IPC contract registry is invalid.');
    }
    channels.add(contract.channel);
  });
}

assertRegistry();
