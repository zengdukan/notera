import {
  initialSessionState,
  sessionReducer,
  type SessionState,
} from '../session';
import { initialOverlayState, overlayReducer } from '../overlay';
import { operationsReducer } from '../operations';

const profile = {
  state: 'UNLOCKED' as const,
  localProfileId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Personal',
  rootFolderId: '20000000-0000-4000-8000-000000000001',
};

describe('session reducer', () => {
  it('moves through unlocking, workspace transition, and unlocked states', () => {
    const unlocking = sessionReducer(initialSessionState, {
      type: 'unlocking',
      localProfileId: profile.localProfileId,
    });
    const transitioning = sessionReducer(unlocking, {
      type: 'transitioning',
      profile,
    });
    const unlocked = sessionReducer(transitioning, {
      type: 'unlocked',
      profile,
    });

    expect(unlocking).toEqual({
      status: 'unlocking',
      localProfileId: profile.localProfileId,
    });
    expect(transitioning).toEqual({ status: 'transitioning', profile });
    expect(unlocked).toEqual({ status: 'unlocked', profile });
  });

  it('drops sensitive state while retaining only a discarded-draft marker', () => {
    const state: SessionState = { status: 'unlocked', profile };
    const locked = sessionReducer(state, {
      type: 'locked',
      discardedDraftProfileId: profile.localProfileId,
    });

    expect(locked).toEqual({
      status: 'locked',
      discardedDraftProfileId: profile.localProfileId,
    });
    expect(JSON.stringify(locked)).not.toContain('Personal');
  });

  it('keeps only the safe error code in a fatal state', () => {
    expect(
      sessionReducer(initialSessionState, {
        type: 'fatal',
        code: 'IPC_OPERATION_FAILED',
      }),
    ).toEqual({ status: 'fatal', code: 'IPC_OPERATION_FAILED' });
  });

  it('allows only one primary overlay at a time', () => {
    const search = overlayReducer(initialOverlayState, {
      type: 'open',
      overlay: { kind: 'search' },
    });
    const settings = overlayReducer(search, {
      type: 'open',
      overlay: { kind: 'settings' },
    });

    expect(settings).toEqual({ kind: 'settings' });
    expect(overlayReducer(settings, { type: 'close' })).toEqual({
      kind: 'none',
    });
  });

  it('tracks operations by ID and clears the entire sensitive domain', () => {
    const operation = {
      operationId: 'operation-a',
      state: 'running' as const,
      progress: 0.5,
    };
    const tracked = operationsReducer({}, { type: 'track', operation });

    expect(tracked).toEqual({ 'operation-a': operation });
    expect(operationsReducer(tracked, { type: 'clear' })).toEqual({});
  });
});
