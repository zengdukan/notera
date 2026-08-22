import type {
  ExportRenderDocument,
  ExportRenderFailure,
  ExportRenderReady,
} from '../../shared';

interface NoteraExportBridge {
  receiveDocument(listener: (value: ExportRenderDocument) => void): () => void;
  ready(value: ExportRenderReady): void;
  failed(value: ExportRenderFailure): void;
}

declare global {
  interface Window {
    noteraExport: NoteraExportBridge;
  }
}

export {};
