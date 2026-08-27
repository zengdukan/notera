import {
  createDocumentSession,
  documentSessionReducer,
} from '../document-session';

const firstDocument = { type: 'doc' as const, version: 1 as const };
const secondDocument = {
  type: 'doc' as const,
  version: 1 as const,
  content: [{ type: 'paragraph' }],
};

describe('document session', () => {
  it('defaults loaded notes to preview and increments revisions for title and ADF edits', () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: 'Title',
      document: firstDocument,
      contentVersion: 3,
      savedAt: 10,
    });
    expect(state).toMatchObject({
      mode: 'preview',
      draftRevision: 0,
      savedRevision: 0,
      saveState: 'clean',
    });

    state = documentSessionReducer(state, { type: 'begin-edit' });
    state = documentSessionReducer(state, { type: 'change-title', title: 'Next' });
    state = documentSessionReducer(state, { type: 'change-document', document: secondDocument });
    expect(state).toMatchObject({
      mode: 'edit',
      draftRevision: 2,
      savedRevision: 0,
      saveState: 'dirty',
      draft: { title: 'Next', document: secondDocument },
    });
  });

  it('does not mark a newer draft clean when an older save finishes', () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: 'Title',
      document: firstDocument,
      contentVersion: 1,
      savedAt: 1,
      mode: 'edit',
    });
    state = documentSessionReducer(state, { type: 'change-title', title: 'First' });
    const savedDraft = state.draft;
    state = documentSessionReducer(state, { type: 'save-started', revision: 1 });
    state = documentSessionReducer(state, { type: 'change-title', title: 'Second' });
    state = documentSessionReducer(state, {
      type: 'save-succeeded',
      revision: 1,
      draft: savedDraft,
      contentVersion: 2,
      savedAt: 2,
    });
    expect(state).toMatchObject({
      draftRevision: 2,
      savedRevision: 1,
      saveState: 'dirty',
      draft: { title: 'Second' },
      saved: { title: 'First', contentVersion: 2 },
    });
  });

  it('retains a failed draft and enters preview only after an explicit success action', () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: '',
      document: firstDocument,
      contentVersion: 1,
      savedAt: 1,
      mode: 'edit',
    });
    state = documentSessionReducer(state, { type: 'change-title', title: 'Draft' });
    state = documentSessionReducer(state, { type: 'save-started', revision: 1 });
    state = documentSessionReducer(state, { type: 'save-failed', revision: 1 });
    expect(state).toMatchObject({ mode: 'edit', saveState: 'failed', draft: { title: 'Draft' } });
    expect(documentSessionReducer(state, { type: 'show-preview' }).mode).toBe('preview');
  });
});
