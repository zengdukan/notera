import type { z } from 'zod';

import {
  operationPhaseSchema,
  operationProgress,
  operationStatusSchema,
  operationTerminalStatusSchema,
  type IpcError,
} from '../../shared';

export type ActiveOperationKind =
  | 'ATTACHMENT_IMPORT'
  | 'ATTACHMENT_SAVE_AS';
export type OperationPhase = z.output<typeof operationPhaseSchema>;
export type OperationProgressPayload = z.output<
  typeof operationProgress.payload
>;
export type OperationStatus = z.output<typeof operationStatusSchema>;
export type OperationTerminalStatus = z.output<
  typeof operationTerminalStatusSchema
>;

type ImportSuccess = Extract<
  OperationTerminalStatus,
  { readonly kind: 'ATTACHMENT_IMPORT'; readonly state: 'SUCCEEDED' }
>['result'];
type SaveAsSuccess = Extract<
  OperationTerminalStatus,
  { readonly kind: 'ATTACHMENT_SAVE_AS'; readonly state: 'SUCCEEDED' }
>['result'];

export interface OperationSuccessByKind {
  readonly ATTACHMENT_IMPORT: ImportSuccess;
  readonly ATTACHMENT_SAVE_AS: SaveAsSuccess;
}

export interface OperationContext {
  readonly signal: AbortSignal;
  progress(phase: OperationPhase, value: number | null): void;
}

export interface OperationEventSink {
  progress(payload: OperationProgressPayload): void;
  completed(payload: OperationTerminalStatus): void;
}

export interface StartOperationInput<Kind extends ActiveOperationKind> {
  readonly kind: Kind;
  execute(
    context: OperationContext,
  ): Promise<OperationSuccessByKind[Kind]>;
  mapError(error: unknown): IpcError;
}
