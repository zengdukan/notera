import { eventContracts, requestContracts } from '../registry';

const requestId = '10000000-0000-4000-8000-000000000001';

describe('settings, activity, and close IPC contracts', () => {
  it('accepts only supported device and profile settings', () => {
    expect(
      requestContracts['settings.updateDevice'].request.safeParse({
        theme: 'DARK',
        language: 'zh-CN',
      }).success,
    ).toBe(true);
    expect(
      requestContracts['settings.updateDevice'].request.safeParse({
        language: 'fr',
      }).success,
    ).toBe(false);
    [1, 5, 15, 30, 60].forEach((autoLockMinutes) => {
      expect(
        requestContracts['settings.updateProfile'].request.safeParse({
          autoLockMinutes,
        }).success,
      ).toBe(true);
    });
    expect(
      requestContracts['settings.updateProfile'].request.safeParse({
        autoLockMinutes: 0,
      }).success,
    ).toBe(false);
  });

  it('defines fixed empty activity and request-scoped close messages', () => {
    expect(
      requestContracts['profile.touchActivity'].request.safeParse({}).success,
    ).toBe(true);
    expect(
      requestContracts['app.completeClose'].request.safeParse({
        requestId,
        action: 'proceed',
      }).success,
    ).toBe(true);
    expect(
      eventContracts['app.closeRequested'].payload.safeParse({ requestId })
        .success,
    ).toBe(true);
    expect(
      eventContracts['app.closeRequested'].payload.safeParse({
        requestId,
        path: 'D:\\private',
      }).success,
    ).toBe(false);
  });
});
