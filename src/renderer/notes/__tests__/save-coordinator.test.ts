import {
  createDocumentSession,
  documentSessionReducer,
  type DocumentSessionAction,
} from '../document-session';
import { createSaveCoordinator } from '../save-coordinator';

const document = { type: 'doc' as const, version: 1 as const };

function deferred<T>() {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return {
    promise,
    resolve: resolveDeferred,
    reject: rejectDeferred,
  };
}

describe('save coordinator', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces for one second, permits one request in flight, and queues newer edits', async () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: 'Title',
      document,
      contentVersion: 1,
      savedAt: 1,
      mode: 'edit',
    });
    const dispatch = (action: DocumentSessionAction) => {
      state = documentSessionReducer(state, action);
    };
    dispatch({ type: 'change-title', title: 'First' });
    const first = deferred<{
      noteId: string;
      contentVersion: number;
      savedAt: number;
    }>();
    const save = jest.fn(() => first.promise);
    const coordinator = createSaveCoordinator({
      getState: () => state,
      dispatch,
      save,
    });

    coordinator.schedule();
    await jest.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      noteId: 'note',
      title: 'First',
      document,
    });

    dispatch({ type: 'change-title', title: 'Second' });
    coordinator.schedule();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ noteId: 'note', contentVersion: 2, savedAt: 2 });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      noteId: 'note',
      title: 'Second',
      document,
    });
  });

  it('flushes immediately, preserves failures, and retries the same draft', async () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: 'Title',
      document,
      contentVersion: 1,
      savedAt: 1,
      mode: 'edit',
    });
    const dispatch = (action: DocumentSessionAction) => {
      state = documentSessionReducer(state, action);
    };
    dispatch({ type: 'change-title', title: 'Draft' });
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValueOnce({ noteId: 'note', contentVersion: 2, savedAt: 2 });
    const coordinator = createSaveCoordinator({
      getState: () => state,
      dispatch,
      save,
    });

    coordinator.schedule();
    await expect(coordinator.flush()).rejects.toThrow('disk');
    expect(save).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      saveState: 'failed',
      draft: { title: 'Draft' },
    });

    await coordinator.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(state).toMatchObject({ saveState: 'clean', savedRevision: 1 });
  });

  it('stops pending retries when the profile locks', async () => {
    let state = createDocumentSession({
      noteId: 'note',
      title: 'Title',
      document,
      contentVersion: 1,
      savedAt: 1,
      mode: 'edit',
    });
    const dispatch = (action: DocumentSessionAction) => {
      state = documentSessionReducer(state, action);
    };
    dispatch({ type: 'change-title', title: 'Draft' });
    const save = jest.fn();
    const coordinator = createSaveCoordinator({
      getState: () => state,
      dispatch,
      save,
    });
    coordinator.schedule();
    coordinator.stop();
    await jest.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
  });
});
