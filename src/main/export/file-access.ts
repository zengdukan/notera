import { basename, dirname, extname, join } from 'node:path';

import {
  sanitizeWindowsBaseName,
  type ExportFormat,
  type ExportPackaging,
} from '@notera/export';

import { MainIpcError } from '../ipc/errors';
import { writeExportEntries } from './archive-writer';
import type {
  ExportDialogPort,
  ExportFileAccess,
  ExportSelection,
} from './types';

function extensionOf(
  format: ExportFormat,
  packaging: ExportPackaging,
): 'md' | 'pdf' | 'zip' {
  if (packaging === 'ZIP') return 'zip';
  return format === 'PDF' ? 'pdf' : 'md';
}

function selectedBaseName(path: string): string {
  const name = basename(path);
  const existingExtension = extname(name);
  const raw =
    existingExtension.length > 0
      ? name.slice(0, -existingExtension.length)
      : name;
  return sanitizeWindowsBaseName(raw, '未命名笔记', 180);
}

export function createExportFileAccess(input: {
  readonly dialogs: ExportDialogPort;
  readonly randomUUID: () => string;
}): ExportFileAccess {
  return Object.freeze({
    async choose(
      value: Parameters<ExportFileAccess['choose']>[0],
    ): Promise<ExportSelection | null> {
      const extension = extensionOf(value.format, value.packaging);
      const suggestedBaseName = sanitizeWindowsBaseName(
        value.suggestedBaseName,
        '未命名笔记',
        180,
      );
      const selected = await input.dialogs.chooseExportPath({
        suggestedName: `${suggestedBaseName}.${extension}`,
        extension,
      });
      if (selected === null) return null;
      try {
        const parent = dirname(selected);
        const base = selectedBaseName(selected);
        const fileName = `${base}.${extension}`;
        const target = join(parent, fileName);
        return Object.freeze({
          baseName: base,
          packaging: value.packaging,
          write: (writeInput: Parameters<ExportSelection['write']>[0]) =>
            writeExportEntries({
              target,
              packaging: value.packaging,
              partId: input.randomUUID(),
              ...writeInput,
            }),
        });
      } catch (error) {
        if (error instanceof MainIpcError) throw error;
        throw new MainIpcError('EXPORT_FAILED');
      }
    },
  });
}
