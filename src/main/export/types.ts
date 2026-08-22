import type { ExportFormat, ExportPackaging } from '@notera/export';

export interface ExportDialogPort {
  chooseExportPath(input: {
    readonly suggestedName: string;
    readonly extension: 'md' | 'pdf' | 'zip';
  }): Promise<string | null>;
}

export interface ExportEntry {
  readonly archivePath: string;
  readonly byteLength: number;
  open(signal: AbortSignal): AsyncIterable<Uint8Array>;
}

export interface ExportSelection {
  readonly baseName: string;
  readonly packaging: ExportPackaging;
  write(input: {
    readonly entries: readonly ExportEntry[];
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number, total: number) => void;
  }): Promise<void>;
}

export interface ExportFileAccess {
  choose(input: {
    readonly suggestedBaseName: string;
    readonly format: ExportFormat;
    readonly packaging: ExportPackaging;
  }): Promise<ExportSelection | null>;
}
