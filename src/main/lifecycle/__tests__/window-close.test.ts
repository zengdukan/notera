import { createWindowCloseController } from '../window-close';

const firstId = '10000000-0000-4000-8000-000000000001';

describe('window close controller', () => {
  it('publishes one request and completes only the matching ID', () => {
    const publish = jest.fn();
    const close = jest.fn();
    const controller = createWindowCloseController({
      publish,
      close,
      randomUUID: () => firstId,
    });
    const event = { preventDefault: jest.fn() };

    controller.request(event);
    controller.request(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({ requestId: firstId });
    expect(() =>
      controller.complete({
        requestId: '20000000-0000-4000-8000-000000000002',
        action: 'proceed',
      }),
    ).toThrow();
    controller.complete({ requestId: firstId, action: 'proceed' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('cancels without closing and permits the one programmatic close', () => {
    const close = jest.fn();
    const controller = createWindowCloseController({
      publish: jest.fn(),
      close,
      randomUUID: () => firstId,
    });
    const event = { preventDefault: jest.fn() };
    controller.request(event);
    controller.complete({ requestId: firstId, action: 'cancel' });
    expect(close).not.toHaveBeenCalled();

    controller.request(event);
    controller.complete({ requestId: firstId, action: 'proceed' });
    const allowed = { preventDefault: jest.fn() };
    controller.request(allowed);
    expect(allowed.preventDefault).not.toHaveBeenCalled();
  });
});
