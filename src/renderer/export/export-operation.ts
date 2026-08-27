import type { EventPayload, RequestData } from '../platform/notera-client';

export type ExportOperation = RequestData<'operation.getStatus'>;
type Listener = () => void;

export class ExportOperationStore {
  private current?: ExportOperation;

  private readonly listeners = new Set<Listener>();

  getSnapshot = (): ExportOperation | undefined => this.current;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  track(operationId: string): void {
    this.set({
      operationId,
      kind: 'NOTE_EXPORT',
      state: 'RUNNING',
      phase: 'PREPARING',
      progress: null,
    });
  }

  applyStatus(status: ExportOperation): void {
    if (
      status.kind !== 'NOTE_EXPORT' ||
      status.operationId !== this.current?.operationId
    )
      return;
    if (this.current.state !== 'RUNNING') return;
    this.set(status);
  }

  applyProgress(payload: EventPayload<'operation.progress'>): void {
    if (
      payload.kind !== 'NOTE_EXPORT' ||
      payload.operationId !== this.current?.operationId ||
      this.current.state !== 'RUNNING'
    )
      return;
    this.set({ ...payload, state: 'RUNNING' });
  }

  applyCompleted(payload: EventPayload<'operation.completed'>): void {
    if (
      payload.kind !== 'NOTE_EXPORT' ||
      payload.operationId !== this.current?.operationId ||
      this.current.state !== 'RUNNING'
    )
      return;
    this.set(payload);
  }

  clear(): void {
    if (this.current === undefined) return;
    this.current = undefined;
    this.notify();
  }

  private set(value: ExportOperation): void {
    this.current = value;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
