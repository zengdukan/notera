import type { AdfDocument } from '../../shared/ipc/adf';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

export interface DocumentDraft {
  readonly title: string;
  readonly document: AdfDocument;
}

export interface DocumentSessionState {
  readonly noteId: string;
  readonly mode: 'preview' | 'edit';
  readonly draftRevision: number;
  readonly savedRevision: number;
  readonly draft: DocumentDraft;
  readonly saved: DocumentDraft & {
    readonly contentVersion: number;
    readonly savedAt: number;
  };
  readonly saveState: SaveState;
}

export type DocumentSessionAction =
  | { readonly type: 'begin-edit' }
  | { readonly type: 'show-preview' }
  | { readonly type: 'change-title'; readonly title: string }
  | { readonly type: 'change-document'; readonly document: AdfDocument }
  | { readonly type: 'save-started'; readonly revision: number }
  | {
      readonly type: 'save-succeeded';
      readonly revision: number;
      readonly draft: DocumentDraft;
      readonly contentVersion: number;
      readonly savedAt: number;
    }
  | { readonly type: 'save-failed'; readonly revision: number };

export function createDocumentSession(input: {
  readonly noteId: string;
  readonly title: string;
  readonly document: AdfDocument;
  readonly contentVersion: number;
  readonly savedAt: number;
  readonly mode?: 'preview' | 'edit';
}): DocumentSessionState {
  const draft = Object.freeze({ title: input.title, document: input.document });
  return Object.freeze({
    noteId: input.noteId,
    mode: input.mode ?? 'preview',
    draftRevision: 0,
    savedRevision: 0,
    draft,
    saved: Object.freeze({
      ...draft,
      contentVersion: input.contentVersion,
      savedAt: input.savedAt,
    }),
    saveState: 'clean',
  });
}

function changed(
  state: DocumentSessionState,
  draft: DocumentDraft,
): DocumentSessionState {
  return {
    ...state,
    draftRevision: state.draftRevision + 1,
    draft,
    saveState: state.saveState === 'saving' ? 'saving' : 'dirty',
  };
}

export function documentSessionReducer(
  state: DocumentSessionState,
  action: DocumentSessionAction,
): DocumentSessionState {
  switch (action.type) {
    case 'begin-edit':
      return { ...state, mode: 'edit' };
    case 'show-preview':
      return { ...state, mode: 'preview' };
    case 'change-title':
      return changed(state, { ...state.draft, title: action.title });
    case 'change-document':
      return changed(state, { ...state.draft, document: action.document });
    case 'save-started':
      return { ...state, saveState: 'saving' };
    case 'save-succeeded':
      return {
        ...state,
        savedRevision: Math.max(state.savedRevision, action.revision),
        saved: {
          ...action.draft,
          contentVersion: action.contentVersion,
          savedAt: action.savedAt,
        },
        saveState: state.draftRevision === action.revision ? 'clean' : 'dirty',
      };
    case 'save-failed':
      return { ...state, saveState: 'failed' };
    default:
      return action satisfies never;
  }
}
