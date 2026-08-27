import type {
  DocumentDraft,
  DocumentSessionAction,
  DocumentSessionState,
} from './document-session';

interface SaveResult {
  readonly noteId: string;
  readonly contentVersion: number;
  readonly savedAt: number;
}

export function createSaveCoordinator(input: {
  readonly getState: () => DocumentSessionState;
  readonly dispatch: (action: DocumentSessionAction) => void;
  readonly save: (value: DocumentDraft & { readonly noteId: string }) => Promise<SaveResult>;
  readonly debounceMs?: number;
}) {
  const debounceMs = input.debounceMs ?? 1_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let queued = false;
  let stopped = false;
  let flushing = false;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (stopped) return;
    if (inFlight !== undefined) {
      queued = true;
      return;
    }
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void runOnce().catch(() => undefined);
    }, debounceMs);
  };

  const runOnce = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (inFlight !== undefined) {
      queued = true;
      return inFlight;
    }
    const state = input.getState();
    if (state.savedRevision >= state.draftRevision) return Promise.resolve();
    const revision = state.draftRevision;
    const draft = state.draft;
    input.dispatch({ type: 'save-started', revision });
    const request = input.save({ noteId: state.noteId, ...draft });
    inFlight = request
      .then((result) => {
        input.dispatch({
          type: 'save-succeeded',
          revision,
          draft,
          contentVersion: result.contentVersion,
          savedAt: result.savedAt,
        });
      })
      .catch((error: unknown) => {
        input.dispatch({ type: 'save-failed', revision });
        throw error;
      })
      .finally(() => {
        inFlight = undefined;
        const needsAnotherSave = input.getState().savedRevision < input.getState().draftRevision;
        if (!stopped && !flushing && (queued || needsAnotherSave)) {
          queued = false;
          schedule();
        }
      });
    return inFlight;
  };

  const flush = async (): Promise<void> => {
    if (stopped) return;
    clearTimer();
    queued = false;
    flushing = true;
    try {
      while (!stopped) {
        if (inFlight !== undefined) await inFlight;
        const state = input.getState();
        if (state.savedRevision >= state.draftRevision) return;
        await runOnce();
      }
    } finally {
      flushing = false;
    }
  };

  return Object.freeze({
    schedule,
    flush,
    retry: flush,
    stop() {
      stopped = true;
      queued = false;
      clearTimer();
    },
    isDirty: () => input.getState().savedRevision < input.getState().draftRevision,
  });
}

export type SaveCoordinator = ReturnType<typeof createSaveCoordinator>;
