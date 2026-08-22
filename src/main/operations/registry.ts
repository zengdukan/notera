import { randomUUID } from 'node:crypto';

import { ApplicationError } from '@notera/application';

import {
  IPC_ERROR_MESSAGES,
  ipcErrorSchema,
  operationPhaseSchema,
  operationStatusSchema,
  operationTerminalStatusSchema,
  type IpcError,
} from '../../shared';
import type {
  ActiveOperationKind,
  OperationContext,
  OperationEventSink,
  OperationPhase,
  OperationStatus,
  OperationTerminalStatus,
  StartOperationInput,
} from './types';

interface OperationRecord {
  readonly operationId: string;
  readonly kind: ActiveOperationKind;
  readonly controller: AbortController;
  status: OperationStatus;
  completion: Promise<OperationTerminalStatus>;
  lastPublishedPhase: OperationPhase | undefined;
  lastPublishedAt: number | undefined;
}

const fallbackError = Object.freeze({
  code: 'IPC_OPERATION_FAILED' as const,
  message: IPC_ERROR_MESSAGES.IPC_OPERATION_FAILED,
});

function runningStatus(
  operationId: string,
  kind: ActiveOperationKind,
): OperationStatus {
  return Object.freeze({
    operationId,
    kind,
    state: 'RUNNING' as const,
    phase: 'PREPARING' as const,
    progress: null,
  });
}

// eslint-disable-next-line import/prefer-default-export
export class OperationRegistry {
  private readonly records = new Map<string, OperationRecord>();

  private readonly randomUUID: () => string;

  private readonly now: () => number;

  private sessionEpoch: string | undefined;

  private accepting = false;

  private endPromise: Promise<void> | undefined;

  constructor(
    private readonly input: {
      readonly sink: OperationEventSink;
      readonly randomUUID?: () => string;
      readonly now?: () => number;
    },
  ) {
    this.randomUUID = input.randomUUID ?? randomUUID;
    this.now = input.now ?? Date.now;
  }

  beginSession(sessionEpoch: string): void {
    if (
      typeof sessionEpoch !== 'string' ||
      sessionEpoch.length === 0 ||
      this.sessionEpoch !== undefined ||
      this.endPromise !== undefined
    ) {
      throw new ApplicationError('OPERATION_FAILED');
    }
    this.sessionEpoch = sessionEpoch;
    this.accepting = true;
  }

  start<Kind extends ActiveOperationKind>(
    input: StartOperationInput<Kind>,
  ): string {
    this.requireSession();
    if (
      input.kind === 'NOTE_EXPORT' &&
      [...this.records.values()].some(
        (record) =>
          record.kind === 'NOTE_EXPORT' && record.status.state === 'RUNNING',
      )
    ) {
      throw new ApplicationError('OPERATION_FAILED');
    }
    const operationId = this.randomUUID();
    if (this.records.has(operationId)) {
      throw new ApplicationError('OPERATION_FAILED');
    }
    const controller = new AbortController();
    const record: OperationRecord = {
      operationId,
      kind: input.kind,
      controller,
      status: runningStatus(operationId, input.kind),
      completion: Promise.resolve(undefined as never),
      lastPublishedPhase: undefined,
      lastPublishedAt: undefined,
    };
    this.records.set(operationId, record);

    const context: OperationContext = Object.freeze({
      signal: controller.signal,
      progress: (
        phase: Parameters<OperationContext['progress']>[0],
        value: Parameters<OperationContext['progress']>[1],
      ) => this.updateProgress(record, phase, value),
    });
    record.completion = Promise.resolve()
      .then(() => input.execute(context))
      .then((result) => {
        if (controller.signal.aborted) return this.cancelled(record);
        const candidate = {
          operationId,
          kind: input.kind,
          state: 'SUCCEEDED' as const,
          result,
        };
        const parsed = operationTerminalStatusSchema.safeParse(candidate);
        return parsed.success
          ? this.finalize(record, parsed.data)
          : this.failed(record, fallbackError);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof ApplicationError &&
            error.code === 'OPERATION_ABORTED')
        ) {
          return this.cancelled(record);
        }
        let mapped: IpcError = fallbackError;
        try {
          const parsed = ipcErrorSchema.safeParse(input.mapError(error));
          if (parsed.success) mapped = parsed.data;
        } catch {
          mapped = fallbackError;
        }
        return this.failed(record, mapped);
      });
    return operationId;
  }

  getStatus(operationId: string): OperationStatus {
    this.requireSession();
    return this.record(operationId).status;
  }

  async cancel(operationId: string): Promise<OperationStatus> {
    this.requireSession();
    const record = this.record(operationId);
    if (record.status.state !== 'RUNNING') return record.status;
    record.controller.abort();
    return record.completion;
  }

  endSession(): Promise<void> {
    if (this.endPromise !== undefined) return this.endPromise;
    this.accepting = false;
    const running = [...this.records.values()].filter(
      (record) => record.status.state === 'RUNNING',
    );
    running.forEach((record) => record.controller.abort());
    this.endPromise = Promise.allSettled(
      running.map((record) => record.completion),
    )
      .then(() => {
        this.records.clear();
        this.sessionEpoch = undefined;
        return undefined;
      })
      .finally(() => {
        this.endPromise = undefined;
      });
    return this.endPromise;
  }

  private requireSession(): void {
    if (!this.accepting || this.sessionEpoch === undefined) {
      throw new ApplicationError('PROFILE_LOCKED');
    }
  }

  private record(operationId: string): OperationRecord {
    const record = this.records.get(operationId);
    if (record === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    return record;
  }

  private updateProgress(
    record: OperationRecord,
    phase: unknown,
    value: unknown,
  ): void {
    if (record.status.state !== 'RUNNING') return;
    const parsedPhase = operationPhaseSchema.safeParse(phase);
    const validValue =
      value === null ||
      (typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1);
    if (!parsedPhase.success || !validValue) return;
    const candidate = {
      operationId: record.operationId,
      kind: record.kind,
      state: 'RUNNING' as const,
      phase: parsedPhase.data,
      progress: value as number | null,
    };
    const parsed = operationStatusSchema.safeParse(candidate);
    if (!parsed.success) return;
    record.status = Object.freeze(parsed.data);
    const timestamp = this.now();
    const shouldPublish =
      record.lastPublishedPhase !== parsedPhase.data ||
      value === 0 ||
      value === 1 ||
      record.lastPublishedAt === undefined ||
      timestamp - record.lastPublishedAt >= 100;
    if (!shouldPublish) return;
    record.lastPublishedPhase = parsedPhase.data;
    record.lastPublishedAt = timestamp;
    try {
      this.input.sink.progress(
        Object.freeze({
          operationId: record.operationId,
          kind: record.kind,
          phase: parsedPhase.data,
          progress: value as number | null,
        }),
      );
    } catch {
      // Renderer notification cannot change operation state.
    }
  }

  private cancelled(record: OperationRecord): OperationTerminalStatus {
    return this.finalize(record, {
      operationId: record.operationId,
      kind: record.kind,
      state: 'CANCELLED',
    });
  }

  private failed(
    record: OperationRecord,
    error: IpcError,
  ): OperationTerminalStatus {
    return this.finalize(record, {
      operationId: record.operationId,
      kind: record.kind,
      state: 'FAILED',
      error,
    });
  }

  private finalize(
    record: OperationRecord,
    terminal: OperationTerminalStatus,
  ): OperationTerminalStatus {
    if (record.status.state !== 'RUNNING') {
      return record.status as OperationTerminalStatus;
    }
    const parsed = operationTerminalStatusSchema.parse(terminal);
    record.status = Object.freeze(parsed);
    try {
      this.input.sink.completed(record.status as OperationTerminalStatus);
    } catch {
      // Renderer notification cannot change operation state.
    }
    return record.status as OperationTerminalStatus;
  }
}
