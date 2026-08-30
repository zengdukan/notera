import {
  PASSWORD_TOO_LONG,
  PROFILE_NAME_TOO_LONG,
  validatePassword,
  validateProfileName,
} from '../profile-form';

describe('Profile form validation', () => {
  it('counts Unicode code points for Profile names', () => {
    expect(validateProfileName('😀'.repeat(100))).toBeUndefined();
    expect(validateProfileName('😀'.repeat(101))).toBe(PROFILE_NAME_TOO_LONG);
  });

  it('counts Unicode code points for master passwords', () => {
    expect(validatePassword('😀'.repeat(1024))).toBeUndefined();
    expect(validatePassword('😀'.repeat(1025))).toBe(PASSWORD_TOO_LONG);
  });
});
