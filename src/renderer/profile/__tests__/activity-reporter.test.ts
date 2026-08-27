import { createActivityReporter } from '../activity-reporter';

describe('profile activity reporter', () => {
  it('reports supported activity at most once per ten seconds', () => {
    let now = 0;
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: jest.fn((name: string, listener: () => void) =>
        listeners.set(name, listener),
      ),
      removeEventListener: jest.fn((name: string) => listeners.delete(name)),
    };
    const touch = jest.fn();
    const reporter = createActivityReporter({ target, touch, now: () => now });
    reporter.start();
    listeners.get('pointerdown')?.();
    listeners.get('keydown')?.();
    expect(touch).toHaveBeenCalledTimes(1);
    now = 10_000;
    listeners.get('scroll')?.();
    expect(touch).toHaveBeenCalledTimes(2);
    reporter.stop();
    expect(target.removeEventListener).toHaveBeenCalledTimes(4);
  });
});
