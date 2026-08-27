export { createProfileManager } from './manager';
export {
  createPreferencesStore,
  type AutoLockMinutes,
  type DeviceSettings,
  type LanguagePreference,
  type PreferencesStore,
  type ProfileSettings,
  type ThemePreference,
} from './preferences';
export { ApplicationError, type ApplicationErrorCode } from './errors';
export type {
  ContentSort,
  ContentSortField,
  EntryRef,
  FavoriteNoteSummary,
  FolderSummary,
  HistoryComparison,
  HistoryRestoreResult,
  HistorySnapshot,
  HistorySummary,
  ListChildrenInput,
  LocalNotesService,
  NoteDetail,
  NoteSummary,
  SearchHighlight,
  SearchResult,
  SortDirection,
  TreeEntrySummary,
  TagSummary,
  TrashItem,
  VersionRef,
} from './local-notes/types';
export type {
  AttachmentAvailability,
  AttachmentContentReader,
  AttachmentGcReport,
  AttachmentRecoveryReport,
  AttachmentSummary,
  ImportAttachmentInput,
  ListAttachmentsForNoteInput,
  LocalAttachmentsService,
} from './local-attachments/types';
export type {
  Page,
  PageRequest,
  ProfileManager,
  ProfileSummary,
  SessionState,
} from './types';
