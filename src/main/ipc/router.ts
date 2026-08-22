import type { z } from 'zod';

import { ipcFailure, requestContracts, type IpcResponse } from '../../shared';
import { mapIpcError, type ErrorContract } from './errors';

export interface IpcInvokeEventLike {
  readonly sender: { readonly id: number };
  readonly senderFrame?: {
    readonly routingId: number;
    readonly parent: unknown;
  } | null;
}

export interface IpcMainPort {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface IpcSenderPolicy {
  allows(event: IpcInvokeEventLike): boolean;
}

type RequestKey = keyof typeof requestContracts;
type RequestFor<Key extends RequestKey> = (typeof requestContracts)[Key];
type RequestInput<Key extends RequestKey> = z.output<
  RequestFor<Key>['request']
>;
interface RuntimeRequestContract extends ErrorContract {
  readonly key: string;
  readonly channel: string;
  readonly request: z.ZodType;
  readonly response: z.ZodType;
}

export interface IpcBinding {
  readonly key: RequestKey;
  readonly contract: RuntimeRequestContract;
  invoke(input: unknown): Promise<unknown>;
}

export function defineIpcBinding<Key extends RequestKey>(
  key: Key,
  invoke: (input: RequestInput<Key>) => Promise<unknown> | unknown,
): IpcBinding {
  return Object.freeze({
    key,
    contract: requestContracts[key] as RuntimeRequestContract,
    invoke: (input: unknown) =>
      Promise.resolve(invoke(input as RequestInput<Key>)),
  });
}

export function registerIpcBindings(input: {
  readonly ipcMain: IpcMainPort;
  readonly senderPolicy: IpcSenderPolicy;
  readonly bindings: readonly IpcBinding[];
}): () => void {
  const keys = new Set<string>();
  const channels = new Set<string>();
  input.bindings.forEach((binding) => {
    if (keys.has(binding.key) || channels.has(binding.contract.channel)) {
      throw new Error('The IPC bindings contain a duplicate key or channel.');
    }
    if (
      binding.key !== binding.contract.key ||
      requestContracts[binding.key] !== binding.contract
    ) {
      throw new Error('The IPC binding does not match the contract registry.');
    }
    keys.add(binding.key);
    channels.add(binding.contract.channel);
  });

  input.bindings.forEach((binding) => {
    input.ipcMain.handle(binding.contract.channel, async (event, rawInput) => {
      try {
        if (!input.senderPolicy.allows(event)) {
          return ipcFailure('IPC_OPERATION_FAILED');
        }
      } catch {
        return ipcFailure('IPC_OPERATION_FAILED');
      }

      const request = binding.contract.request.safeParse(rawInput);
      if (!request.success) return ipcFailure('INVALID_IPC_REQUEST');

      try {
        const data = await binding.invoke(request.data);
        const response: IpcResponse<unknown> = { ret: true, data };
        const parsed = binding.contract.response.safeParse(response);
        return parsed.success
          ? parsed.data
          : ipcFailure('IPC_OPERATION_FAILED');
      } catch (error) {
        return mapIpcError(binding.contract, error);
      }
    });
  });

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    input.bindings.forEach((binding) => {
      input.ipcMain.removeHandler(binding.contract.channel);
    });
  };
}
