import type { NativeSqlcipherConstructor } from './types';

export function loadNativeSqlcipher(): NativeSqlcipherConstructor {
  // Keep the native dependency behind this internal boundary so callers never
  // receive the driver module or its implementation-specific types.
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('notera-sqlcipher') as NativeSqlcipherConstructor;
}
