import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { z } from 'zod';
import {
  eventContracts,
  ipcFailure,
  requestContracts,
  type InvokeMethod,
  type IpcResponse,
  type NoteraApi,
  type SubscribeMethod,
} from '../shared';

interface RequestContractShape {
  readonly channel: string;
  readonly request: z.ZodType;
  readonly data: z.ZodType;
  readonly response: z.ZodType;
}

interface EventContractShape {
  readonly channel: string;
  readonly payload: z.ZodType;
}

async function invoke(
  contract: RequestContractShape,
  input: unknown,
): Promise<IpcResponse<unknown>> {
  const request = contract.request.safeParse(input);
  if (!request.success) {
    return ipcFailure('INVALID_IPC_REQUEST');
  }

  try {
    const rawResponse: unknown = await ipcRenderer.invoke(
      contract.channel,
      request.data,
    );
    const response = contract.response.safeParse(rawResponse);
    return response.success
      ? (response.data as IpcResponse<unknown>)
      : ipcFailure('INVALID_IPC_RESPONSE');
  } catch {
    return ipcFailure('IPC_OPERATION_FAILED');
  }
}

function subscribe(
  contract: EventContractShape,
  listener: (payload: unknown) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, rawPayload: unknown) => {
    const payload = contract.payload.safeParse(rawPayload);
    if (payload.success) {
      listener(payload.data);
    }
  };
  ipcRenderer.on(contract.channel, wrapped);

  return () => {
    ipcRenderer.removeListener(contract.channel, wrapped);
  };
}

function bindRequest<C extends RequestContractShape>(
  contract: C,
): InvokeMethod<C> {
  return (input) =>
    invoke(contract, input) as Promise<IpcResponse<z.output<C['data']>>>;
}

function bindEvent<E extends EventContractShape>(
  contract: E,
): SubscribeMethod<E> {
  return (listener) =>
    subscribe(contract, listener as (value: unknown) => void);
}

const noteraApi = {
  profile: {
    list: bindRequest(requestContracts['profile.list']),
    getSessionState: bindRequest(requestContracts['profile.getSessionState']),
    create: bindRequest(requestContracts['profile.create']),
    unlock: bindRequest(requestContracts['profile.unlock']),
    lock: bindRequest(requestContracts['profile.lock']),
    switch: bindRequest(requestContracts['profile.switch']),
    rename: bindRequest(requestContracts['profile.rename']),
    changePassword: bindRequest(requestContracts['profile.changePassword']),
    removeFromDevice: bindRequest(requestContracts['profile.removeFromDevice']),
  },
  contentTree: {
    listChildren: bindRequest(requestContracts['contentTree.listChildren']),
    createFolder: bindRequest(requestContracts['contentTree.createFolder']),
    renameFolder: bindRequest(requestContracts['contentTree.renameFolder']),
    moveFolder: bindRequest(requestContracts['contentTree.moveFolder']),
    reorderEntry: bindRequest(requestContracts['contentTree.reorderEntry']),
    trashFolder: bindRequest(requestContracts['contentTree.trashFolder']),
  },
  note: {
    create: bindRequest(requestContracts['note.create']),
    get: bindRequest(requestContracts['note.get']),
    saveDraft: bindRequest(requestContracts['note.saveDraft']),
    move: bindRequest(requestContracts['note.move']),
    copy: bindRequest(requestContracts['note.copy']),
    trash: bindRequest(requestContracts['note.trash']),
    listRecent: bindRequest(requestContracts['note.listRecent']),
  },
  tag: {
    list: bindRequest(requestContracts['tag.list']),
    create: bindRequest(requestContracts['tag.create']),
    rename: bindRequest(requestContracts['tag.rename']),
    delete: bindRequest(requestContracts['tag.delete']),
    addToNote: bindRequest(requestContracts['tag.addToNote']),
    removeFromNote: bindRequest(requestContracts['tag.removeFromNote']),
  },
  favorite: {
    list: bindRequest(requestContracts['favorite.list']),
    add: bindRequest(requestContracts['favorite.add']),
    remove: bindRequest(requestContracts['favorite.remove']),
    reorder: bindRequest(requestContracts['favorite.reorder']),
  },
  batch: {
    move: bindRequest(requestContracts['batch.move']),
    addTags: bindRequest(requestContracts['batch.addTags']),
    removeTags: bindRequest(requestContracts['batch.removeTags']),
    copy: bindRequest(requestContracts['batch.copy']),
    trash: bindRequest(requestContracts['batch.trash']),
  },
  history: {
    list: bindRequest(requestContracts['history.list']),
    get: bindRequest(requestContracts['history.get']),
    createPermanent: bindRequest(requestContracts['history.createPermanent']),
    compare: bindRequest(requestContracts['history.compare']),
    restore: bindRequest(requestContracts['history.restore']),
    copy: bindRequest(requestContracts['history.copy']),
  },
  trash: {
    list: bindRequest(requestContracts['trash.list']),
    restore: bindRequest(requestContracts['trash.restore']),
    deletePermanent: bindRequest(requestContracts['trash.deletePermanent']),
    purgeExpired: bindRequest(requestContracts['trash.purgeExpired']),
  },
  search: {
    query: bindRequest(requestContracts['search.query']),
  },
  attachment: {
    listForNote: bindRequest(requestContracts['attachment.listForNote']),
    startImport: bindRequest(requestContracts['attachment.startImport']),
    removeFromNote: bindRequest(requestContracts['attachment.removeFromNote']),
    getPreviewUrl: bindRequest(requestContracts['attachment.getPreviewUrl']),
    startSaveAs: bindRequest(requestContracts['attachment.startSaveAs']),
  },
  export: {
    startNote: bindRequest(requestContracts['export.startNote']),
  },
  operation: {
    getStatus: bindRequest(requestContracts['operation.getStatus']),
    cancel: bindRequest(requestContracts['operation.cancel']),
  },
  events: {
    onProfileLocked: bindEvent(eventContracts['profile.locked']),
    onOperationProgress: bindEvent(eventContracts['operation.progress']),
    onOperationCompleted: bindEvent(eventContracts['operation.completed']),
  },
} satisfies NoteraApi;

contextBridge.exposeInMainWorld('notera', noteraApi);
