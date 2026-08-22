import { AttachmentStorageError } from './errors';

export interface CombinedAbortSignal {
  readonly signal: AbortSignal;
  cleanup(): void;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AttachmentStorageError('OPERATION_ABORTED');
  }
}

export function combineAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
): CombinedAbortSignal {
  const controller = new AbortController();
  const activeSignals = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  const abort = () => controller.abort();
  activeSignals.forEach((signal) => {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  return {
    signal: controller.signal,
    cleanup() {
      activeSignals.forEach((signal) =>
        signal.removeEventListener('abort', abort),
      );
    },
  };
}
