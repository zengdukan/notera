import type { NoteraApi } from '../../../shared';
import { IPC_ERROR_MESSAGES } from '../../../shared';
import { createNoteraClient, NoteraClientError } from '../notera-client';
import { createProfileLockSignal } from '../notera-events';

function apiWith(overrides: Partial<NoteraApi>): NoteraApi {
  return overrides as NoteraApi;
}

describe('notera client', () => {
  it('unwraps successful request data', async () => {
    const api = apiWith({
      profile: {
        getSessionState: jest
          .fn()
          .mockResolvedValue({ ret: true, data: { state: 'LOCKED' } }),
      } as unknown as NoteraApi['profile'],
    });
    const client = createNoteraClient(api);

    await expect(
      client.request('profile.getSessionState', {}),
    ).resolves.toEqual({ state: 'LOCKED' });
  });

  it('throws only the safe code and reports profile locking', async () => {
    const locked = jest.fn();
    const api = apiWith({
      note: {
        get: jest.fn().mockResolvedValue({
          ret: false,
          error: {
            code: 'PROFILE_LOCKED',
            message: IPC_ERROR_MESSAGES.PROFILE_LOCKED,
          },
        }),
      } as unknown as NoteraApi['note'],
    });
    const client = createNoteraClient(api, { onProfileLocked: locked });

    const error = await client
      .request('note.get', {
        noteId: '10000000-0000-4000-8000-000000000001',
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(NoteraClientError);
    expect(error).toMatchObject({ code: 'PROFILE_LOCKED' });
    expect(error).not.toHaveProperty('details');
    expect(locked).toHaveBeenCalledTimes(1);
  });

  it('validates event payloads and unsubscribes through the fixed API', () => {
    let bridgeListener: ((payload: unknown) => void) | undefined;
    const remove = jest.fn();
    const listener = jest.fn();
    const api = apiWith({
      events: {
        onProfileLocked: jest.fn((next) => {
          bridgeListener = next as (payload: unknown) => void;
          return remove;
        }),
      } as unknown as NoteraApi['events'],
    });
    const client = createNoteraClient(api);

    const unsubscribe = client.subscribe('profile.locked', listener);
    bridgeListener?.({ reason: 'MANUAL' });
    bridgeListener?.({ reason: 'not-valid' });
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ reason: 'MANUAL' });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('multicasts a profile lock signal and removes subscribers', () => {
    const signal = createProfileLockSignal();
    const first = jest.fn();
    const second = jest.fn();
    const removeFirst = signal.subscribe(first);
    signal.subscribe(second);

    signal.emit();
    removeFirst();
    signal.emit();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
