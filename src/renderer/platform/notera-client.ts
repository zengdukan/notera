import type { z } from 'zod';

import {
  eventContracts,
  requestContracts,
  type IpcErrorCode,
  type IpcResponse,
  type NoteraApi,
} from '../../shared';

export type RequestKey = keyof typeof requestContracts;
export type EventKey = keyof typeof eventContracts;

type RequestContract<Key extends RequestKey> = (typeof requestContracts)[Key];
type EventContract<Key extends EventKey> = (typeof eventContracts)[Key];

export type RequestInput<Key extends RequestKey> = z.input<
  RequestContract<Key>['request']
>;
export type RequestData<Key extends RequestKey> = z.output<
  RequestContract<Key>['data']
>;
export type EventPayload<Key extends EventKey> = z.output<
  EventContract<Key>['payload']
>;

export class NoteraClientError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode) {
    super(code);
    this.name = 'NoteraClientError';
    this.code = code;
  }
}

export interface NoteraClient {
  request<Key extends RequestKey>(
    key: Key,
    input: RequestInput<Key>,
  ): Promise<RequestData<Key>>;
  subscribe<Key extends EventKey>(
    key: Key,
    listener: (payload: EventPayload<Key>) => void,
  ): () => void;
}

type UnknownRequest = (input: unknown) => Promise<IpcResponse<unknown>>;
type UnknownSubscribe = (listener: (payload: unknown) => void) => () => void;

function requestMethod(api: NoteraApi, key: RequestKey): UnknownRequest {
  const [group, method] = key.split('.') as [keyof NoteraApi, string];
  const namespace = api[group] as unknown as Record<string, UnknownRequest>;
  return namespace[method];
}

function eventMethod(api: NoteraApi, key: EventKey): UnknownSubscribe {
  const methods: Record<EventKey, UnknownSubscribe> = {
    'profile.locked': api.events.onProfileLocked as UnknownSubscribe,
    'operation.progress': api.events.onOperationProgress as UnknownSubscribe,
    'operation.completed': api.events.onOperationCompleted as UnknownSubscribe,
    'app.closeRequested': api.events.onAppCloseRequested as UnknownSubscribe,
  };
  return methods[key];
}

export function createNoteraClient(
  api: NoteraApi,
  options: { readonly onProfileLocked?: () => void } = {},
): NoteraClient {
  return Object.freeze({
    async request<Key extends RequestKey>(
      key: Key,
      input: RequestInput<Key>,
    ): Promise<RequestData<Key>> {
      const response = await requestMethod(api, key)(input);
      if (response.ret) return response.data as RequestData<Key>;
      if (response.error.code === 'PROFILE_LOCKED') {
        options.onProfileLocked?.();
      }
      throw new NoteraClientError(response.error.code);
    },
    subscribe<Key extends EventKey>(
      key: Key,
      listener: (payload: EventPayload<Key>) => void,
    ): () => void {
      const contract = eventContracts[key];
      return eventMethod(
        api,
        key,
      )((payload) => {
        const parsed = contract.payload.safeParse(payload);
        if (parsed.success) listener(parsed.data as EventPayload<Key>);
      });
    },
  });
}
