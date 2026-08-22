import {
  ATTACHMENT_CHUNK_BYTES,
  MAX_ATTACHMENT_BYTES,
} from './constants';
import { throwIfAborted } from './cancellation';
import { AttachmentStorageError } from './errors';

function invalidInput(): never {
  throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
}

export async function* fixedSizeChunks(
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  if (
    typeof source !== 'object' ||
    source === null ||
    typeof source[Symbol.asyncIterator] !== 'function'
  ) {
    return invalidInput();
  }
  throwIfAborted(signal);
  const iterator = source[Symbol.asyncIterator]();
  let rejectAbort!: (error: AttachmentStorageError) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort(new AttachmentStorageError('OPERATION_ABORTED'));
    void iterator.return?.().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  let completed = false;
  let total = 0;
  let pending = new Uint8Array(ATTACHMENT_CHUNK_BYTES);
  let pendingLength = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const result = await Promise.race([iterator.next(), aborted]);
      if (result.done) {
        completed = true;
        break;
      }
      if (!(result.value instanceof Uint8Array)) {
        return invalidInput();
      }
      let sourceOffset = 0;
      while (sourceOffset < result.value.byteLength) {
        throwIfAborted(signal);
        if (total >= MAX_ATTACHMENT_BYTES) {
          throw new AttachmentStorageError('ATTACHMENT_TOO_LARGE');
        }
        const copyLength = Math.min(
          ATTACHMENT_CHUNK_BYTES - pendingLength,
          result.value.byteLength - sourceOffset,
          MAX_ATTACHMENT_BYTES - total,
        );
        pending.set(
          result.value.subarray(sourceOffset, sourceOffset + copyLength),
          pendingLength,
        );
        pendingLength += copyLength;
        sourceOffset += copyLength;
        total += copyLength;
        if (pendingLength === ATTACHMENT_CHUNK_BYTES) {
          yield pending;
          pending = new Uint8Array(ATTACHMENT_CHUNK_BYTES);
          pendingLength = 0;
        }
      }
    }
    if (pendingLength > 0) yield pending.slice(0, pendingLength);
    else if (total === 0) yield new Uint8Array();
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!completed && !signal?.aborted) {
      try {
        await iterator.return?.();
      } catch {
        // The original source or validation error remains authoritative.
      }
    }
  }
}
