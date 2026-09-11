import { createAppBindings, type AppWindowPort } from '../app-handlers';

function setup(maximized = false) {
  const closeController = { complete: jest.fn() };
  const window: jest.Mocked<AppWindowPort> = {
    close: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    isMaximized: jest.fn(() => maximized),
  };
  const bindings = createAppBindings({ closeController, window });
  const invoke = (key: (typeof bindings)[number]['key'], value = {}) => {
    const binding = bindings.find((candidate) => candidate.key === key);
    if (binding === undefined) throw new Error(`Missing binding ${key}`);
    return binding.invoke(value);
  };
  return { closeController, window, invoke };
}

describe('app window IPC handlers', () => {
  it('completes the existing guarded close request', async () => {
    const state = setup();
    const value = {
      requestId: '10000000-0000-4000-8000-000000000001',
      action: 'proceed' as const,
    };

    await expect(
      state.invoke('app.completeClose', value),
    ).resolves.toEqual({});
    expect(state.closeController.complete).toHaveBeenCalledWith(value);
  });

  it('minimizes and requests a guarded window close', async () => {
    const state = setup();

    await state.invoke('app.minimizeWindow');
    await state.invoke('app.closeWindow');

    expect(state.window.minimize).toHaveBeenCalledTimes(1);
    expect(state.window.close).toHaveBeenCalledTimes(1);
  });

  it('maximizes a restored window', async () => {
    const state = setup(false);

    await state.invoke('app.toggleMaximizeWindow');

    expect(state.window.maximize).toHaveBeenCalledTimes(1);
    expect(state.window.unmaximize).not.toHaveBeenCalled();
  });

  it('restores a maximized window', async () => {
    const state = setup(true);

    await state.invoke('app.toggleMaximizeWindow');

    expect(state.window.unmaximize).toHaveBeenCalledTimes(1);
    expect(state.window.maximize).not.toHaveBeenCalled();
  });
});
