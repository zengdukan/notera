import { handleCloseRequest } from '../close-guard';

describe('renderer close guard', () => {
  it('proceeds immediately when there is no dirty document', async () => {
    const complete = jest.fn();
    await handleCloseRequest({
      requestId: 'request-a',
      isDirty: () => false,
      flush: jest.fn(),
      chooseAfterFailure: jest.fn(),
      complete,
    });
    expect(complete).toHaveBeenCalledWith({
      requestId: 'request-a',
      action: 'proceed',
    });
  });

  it('supports retry, discard, and stay after a failed save', async () => {
    const complete = jest.fn();
    const flush = jest
      .fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined);
    await handleCloseRequest({
      requestId: 'request-a',
      isDirty: () => true,
      flush,
      chooseAfterFailure: jest.fn(async () => 'retry'),
      complete,
    });
    expect(flush).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenLastCalledWith({
      requestId: 'request-a',
      action: 'proceed',
    });

    complete.mockClear();
    await handleCloseRequest({
      requestId: 'request-b',
      isDirty: () => true,
      flush: jest.fn().mockRejectedValue(new Error('save failed')),
      chooseAfterFailure: jest.fn(async () => 'stay'),
      complete,
    });
    expect(complete).toHaveBeenCalledWith({
      requestId: 'request-b',
      action: 'cancel',
    });
  });
});
