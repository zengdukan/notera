import type { ProfileManager, SessionState } from '@notera/application';

export const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

export function createProfileManagerFake(
  initialState: SessionState = { state: 'LOCKED' },
) {
  let state = initialState;
  const manager = {
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
  const window = {
    isDestroyed: () => destroyed,
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
    destroy: () => {
      destroyed = true;
    },
  };
}
