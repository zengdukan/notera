import { ApplicationError } from '@notera/application';

import {
  IPC_ERROR_CODES,
  ipcFailure,
  type IpcErrorCode,
  type IpcFailure,
} from '../../shared';

export interface ErrorContract {
  readonly errors: readonly IpcErrorCode[];
}

const knownCodes = new Set<string>(IPC_ERROR_CODES);

export function mapIpcError(
  contract: ErrorContract,
  error: unknown,
): IpcFailure {
  if (
    error instanceof ApplicationError &&
    knownCodes.has(error.code) &&
    contract.errors.includes(error.code as IpcErrorCode)
  ) {
    return ipcFailure(error.code as IpcErrorCode);
  }
  return ipcFailure('IPC_OPERATION_FAILED');
}
