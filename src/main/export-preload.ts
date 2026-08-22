import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  EXPORT_RENDER_CHANNELS,
  exportRenderDocumentSchema,
  exportRenderFailureSchema,
  exportRenderReadySchema,
  type ExportRenderDocument,
  type ExportRenderFailure,
  type ExportRenderReady,
} from '../shared';

export interface NoteraExportBridge {
  receiveDocument(listener: (value: ExportRenderDocument) => void): () => void;
  ready(value: ExportRenderReady): void;
  failed(value: ExportRenderFailure): void;
}

const bridge: NoteraExportBridge = Object.freeze({
  receiveDocument(listener: (value: ExportRenderDocument) => void) {
    let active = true;
    const remove = () => {
      if (!active) return;
      active = false;
      ipcRenderer.removeListener(EXPORT_RENDER_CHANNELS.document, wrapped);
    };
    const wrapped = (_event: IpcRendererEvent, rawValue: unknown) => {
      const value = exportRenderDocumentSchema.safeParse(rawValue);
      if (!active || !value.success) return;
      remove();
      listener(value.data);
    };
    ipcRenderer.on(EXPORT_RENDER_CHANNELS.document, wrapped);
    return remove;
  },

  ready(value: ExportRenderReady) {
    const parsed = exportRenderReadySchema.safeParse(value);
    if (parsed.success) {
      ipcRenderer.send(EXPORT_RENDER_CHANNELS.ready, parsed.data);
    }
  },

  failed(value: ExportRenderFailure) {
    const parsed = exportRenderFailureSchema.safeParse(value);
    if (parsed.success) {
      ipcRenderer.send(EXPORT_RENDER_CHANNELS.failed, parsed.data);
    }
  },
});

contextBridge.exposeInMainWorld('noteraExport', bridge);
