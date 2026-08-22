import type { NoteExportCoordinator } from '../export/coordinator';
import type { SessionCommandGate } from './local-notes-handlers';
import { defineIpcBinding, type IpcBinding } from './router';

export function createExportBindings(input: {
  readonly coordinator: NoteExportCoordinator;
  readonly gate: SessionCommandGate;
}): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('export.startNote', (value) =>
      input.gate.run(() => input.coordinator.start(value)),
    ),
  ]);
}
