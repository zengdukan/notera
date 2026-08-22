import { ApplicationError } from '@notera/application';

import {
  IPC_ERROR_CODES,
  IPC_ERROR_MESSAGES,
  ipcFailure,
  type IpcError,
  type IpcErrorCode,
  type IpcFailure,
} from '../../shared';

export interface ErrorContract {
  readonly errors: readonly IpcErrorCode[];
}

const knownCodes = new Set<string>(IPC_ERROR_CODES);

export class MainIpcError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode) {
    super(IPC_ERROR_MESSAGES[code]);
    this.name = 'MainIpcError';
    this.code = code;
  }
}

export function mapIpcError(
  contract: ErrorContract,
  error: unknown,
): IpcFailure {
  if (
    (error instanceof ApplicationError || error instanceof MainIpcError) &&
    knownCodes.has(error.code) &&
    contract.errors.includes(error.code as IpcErrorCode)
  ) {
    return ipcFailure(error.code as IpcErrorCode);
  }
  return ipcFailure('IPC_OPERATION_FAILED');
}

export function toIpcError(contract: ErrorContract, error: unknown): IpcError {
  return mapIpcError(contract, error).error;
}
