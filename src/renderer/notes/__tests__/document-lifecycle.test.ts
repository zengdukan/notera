import { ActiveDocumentLifecycle } from '../document-lifecycle';

describe('ActiveDocumentLifecycle', () => {
  it('flushes only the active dirty document before guarded operations', async () => {
    const lifecycle = new ActiveDocumentLifecycle();
    const flush = jest.fn().mockResolvedValue(undefined);
    lifecycle.attach({ isDirty: () => true, flush, stop: jest.fn() });

    await expect(lifecycle.flushBefore('move')).resolves.toBe('ready');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(lifecycle.isDirty()).toBe(true);
  });

  it('blocks a guarded operation when the active save fails', async () => {
    const lifecycle = new ActiveDocumentLifecycle();
    lifecycle.attach({
      isDirty: () => true,
      flush: jest.fn().mockRejectedValue(new Error('save failed')),
      stop: jest.fn(),
    });

    await expect(lifecycle.flushBefore('trash')).resolves.toBe('blocked');
  });

  it('stops and detaches the active coordinator during secure cleanup', () => {
    const lifecycle = new ActiveDocumentLifecycle();
    const stop = jest.fn();
    const detach = lifecycle.attach({ isDirty: () => false, flush: jest.fn(), stop });

    detach();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(lifecycle.isDirty()).toBe(false);
  });
});
