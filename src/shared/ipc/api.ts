import type { z } from 'zod';
import type { IpcResponse } from './common';
import type { eventContracts, requestContracts } from './registry';

type RequestContractShape = {
  readonly request: z.ZodType;
  readonly data: z.ZodType;
};
type EventContractShape = { readonly payload: z.ZodType };
type Request<Key extends keyof typeof requestContracts> =
  (typeof requestContracts)[Key];
type Event<Key extends keyof typeof eventContracts> =
  (typeof eventContracts)[Key];

export type InvokeMethod<C extends RequestContractShape> = (
  input: z.input<C['request']>,
) => Promise<IpcResponse<z.output<C['data']>>>;

export type SubscribeMethod<E extends EventContractShape> = (
  listener: (payload: z.output<E['payload']>) => void,
) => () => void;

export interface NoteraApi {
  readonly profile: {
    readonly list: InvokeMethod<Request<'profile.list'>>;
    readonly getSessionState: InvokeMethod<Request<'profile.getSessionState'>>;
    readonly create: InvokeMethod<Request<'profile.create'>>;
    readonly unlock: InvokeMethod<Request<'profile.unlock'>>;
    readonly lock: InvokeMethod<Request<'profile.lock'>>;
    readonly touchActivity: InvokeMethod<Request<'profile.touchActivity'>>;
    readonly switch: InvokeMethod<Request<'profile.switch'>>;
    readonly rename: InvokeMethod<Request<'profile.rename'>>;
    readonly changePassword: InvokeMethod<Request<'profile.changePassword'>>;
    readonly removeFromDevice: InvokeMethod<
      Request<'profile.removeFromDevice'>
    >;
  };
  readonly contentTree: {
    readonly listChildren: InvokeMethod<Request<'contentTree.listChildren'>>;
    readonly getFolderPath: InvokeMethod<Request<'contentTree.getFolderPath'>>;
    readonly createFolder: InvokeMethod<Request<'contentTree.createFolder'>>;
    readonly renameFolder: InvokeMethod<Request<'contentTree.renameFolder'>>;
    readonly moveFolder: InvokeMethod<Request<'contentTree.moveFolder'>>;
    readonly trashFolder: InvokeMethod<Request<'contentTree.trashFolder'>>;
  };
  readonly note: {
    readonly create: InvokeMethod<Request<'note.create'>>;
    readonly get: InvokeMethod<Request<'note.get'>>;
    readonly rename: InvokeMethod<Request<'note.rename'>>;
    readonly saveDraft: InvokeMethod<Request<'note.saveDraft'>>;
    readonly move: InvokeMethod<Request<'note.move'>>;
    readonly copy: InvokeMethod<Request<'note.copy'>>;
    readonly trash: InvokeMethod<Request<'note.trash'>>;
    readonly listRecent: InvokeMethod<Request<'note.listRecent'>>;
  };
  readonly tag: {
    readonly list: InvokeMethod<Request<'tag.list'>>;
    readonly create: InvokeMethod<Request<'tag.create'>>;
    readonly rename: InvokeMethod<Request<'tag.rename'>>;
    readonly delete: InvokeMethod<Request<'tag.delete'>>;
    readonly addToNote: InvokeMethod<Request<'tag.addToNote'>>;
    readonly removeFromNote: InvokeMethod<Request<'tag.removeFromNote'>>;
  };
  readonly favorite: {
    readonly list: InvokeMethod<Request<'favorite.list'>>;
    readonly add: InvokeMethod<Request<'favorite.add'>>;
    readonly remove: InvokeMethod<Request<'favorite.remove'>>;
    readonly reorder: InvokeMethod<Request<'favorite.reorder'>>;
  };
  readonly batch: {
    readonly move: InvokeMethod<Request<'batch.move'>>;
    readonly addTags: InvokeMethod<Request<'batch.addTags'>>;
    readonly removeTags: InvokeMethod<Request<'batch.removeTags'>>;
    readonly copy: InvokeMethod<Request<'batch.copy'>>;
    readonly trash: InvokeMethod<Request<'batch.trash'>>;
  };
  readonly history: {
    readonly list: InvokeMethod<Request<'history.list'>>;
    readonly get: InvokeMethod<Request<'history.get'>>;
    readonly createPermanent: InvokeMethod<Request<'history.createPermanent'>>;
    readonly rename: InvokeMethod<Request<'history.rename'>>;
    readonly compare: InvokeMethod<Request<'history.compare'>>;
    readonly restore: InvokeMethod<Request<'history.restore'>>;
    readonly copy: InvokeMethod<Request<'history.copy'>>;
  };
  readonly trash: {
    readonly list: InvokeMethod<Request<'trash.list'>>;
    readonly restore: InvokeMethod<Request<'trash.restore'>>;
    readonly deletePermanent: InvokeMethod<Request<'trash.deletePermanent'>>;
    readonly purgeExpired: InvokeMethod<Request<'trash.purgeExpired'>>;
  };
  readonly search: {
    readonly query: InvokeMethod<Request<'search.query'>>;
  };
  readonly attachment: {
    readonly listForNote: InvokeMethod<Request<'attachment.listForNote'>>;
    readonly startImport: InvokeMethod<Request<'attachment.startImport'>>;
    readonly removeFromNote: InvokeMethod<Request<'attachment.removeFromNote'>>;
    readonly getPreviewUrl: InvokeMethod<Request<'attachment.getPreviewUrl'>>;
    readonly startSaveAs: InvokeMethod<Request<'attachment.startSaveAs'>>;
  };
  readonly export: {
    readonly startNote: InvokeMethod<Request<'export.startNote'>>;
  };
  readonly operation: {
    readonly getStatus: InvokeMethod<Request<'operation.getStatus'>>;
    readonly cancel: InvokeMethod<Request<'operation.cancel'>>;
  };
  readonly settings: {
    readonly getDevice: InvokeMethod<Request<'settings.getDevice'>>;
    readonly updateDevice: InvokeMethod<Request<'settings.updateDevice'>>;
    readonly getProfile: InvokeMethod<Request<'settings.getProfile'>>;
    readonly updateProfile: InvokeMethod<Request<'settings.updateProfile'>>;
  };
  readonly app: {
    readonly completeClose: InvokeMethod<Request<'app.completeClose'>>;
  };
  readonly events: {
    readonly onProfileLocked: SubscribeMethod<Event<'profile.locked'>>;
    readonly onOperationProgress: SubscribeMethod<Event<'operation.progress'>>;
    readonly onOperationCompleted: SubscribeMethod<
      Event<'operation.completed'>
    >;
    readonly onAppCloseRequested: SubscribeMethod<Event<'app.closeRequested'>>;
  };
}
