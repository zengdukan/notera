import type { ProfileManager, SessionState } from '@notera/application';

export const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

export function createProfileManagerFake(
  initialState: SessionState = { state: 'LOCKED' },
) {
  let state = initialState;
  const manager = {
    preferences: {
      getDevice: jest.fn(() => ({ theme: 'SYSTEM', language: 'en' })),
      updateDevice: jest.fn(async (input) => ({
        theme: input.theme ?? 'SYSTEM',
        language: input.language ?? 'en',
      })),
      getProfile: jest.fn(() => ({ autoLockMinutes: 15 })),
      updateProfile: jest.fn(async (_profileId, input) => input),
      removeProfile: jest.fn(async () => undefined),
    },
    localNotes: {},
    localAttachments: {
      importAttachment: jest.fn(),
      listForNote: jest.fn(),
      openReader: jest.fn(),
      removeFromNote: jest.fn(),
      collectGarbage: jest.fn(),
    },
    listProfiles: jest.fn(() => ({ items: [] })),
    getSessionState: jest.fn(() => state),
    createProfile: jest.fn(),
    unlockProfile: jest.fn(),
    lockProfile: jest.fn(async () => {
      state = { state: 'LOCKED' };
    }),
    switchProfile: jest.fn(),
    renameProfile: jest.fn(),
    changeProfilePassword: jest.fn(),
    removeProfileFromDevice: jest.fn(),
    close: jest.fn(async () => {
      state = { state: 'LOCKED' };
    }),
  } as unknown as ProfileManager;
  return {
    manager,
    setState: (value: SessionState) => {
      state = value;
    },
  };
}

export function createRuntimeWindowFake() {
  const send = jest.fn();
  let destroyed = false;
  const listeners = new Map<
    string,
    (event: { preventDefault(): void }) => void
  >();
  const close = jest.fn(() => {
    listeners.get('close')?.({ preventDefault: jest.fn() });
  });
  const window = {
    isDestroyed: () => destroyed,
    on: jest.fn(
      (
        event: string,
        listener: (event: { preventDefault(): void }) => void,
      ) => {
        listeners.set(event, listener);
      },
    ),
    removeListener: jest.fn(
      (
        event: string,
        listener: (event: { preventDefault(): void }) => void,
      ) => {
        if (listeners.get(event) === listener) listeners.delete(event);
      },
    ),
    close,
    webContents: {
      id: 7,
      mainFrame: { routingId: 11 },
      isDestroyed: () => destroyed,
      send,
    },
  };
  return {
    window,
    send,
    close,
    listeners,
    destroy: () => {
      destroyed = true;
    },
  };
}
