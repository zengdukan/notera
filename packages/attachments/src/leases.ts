import { asBlobId, type BlobId } from '@notera/domain';
import { AttachmentStorageError } from './errors';

interface BlobLeaseState {
  readers: number;
  deleting: boolean;
}

function validatedBlobId(value: BlobId | string): BlobId {
  try {
    return asBlobId(value);
  } catch {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
}

export class BlobLeaseRegistry {
  private readonly states = new Map<BlobId, BlobLeaseState>();

  private closed = false;

  acquireReader(value: BlobId | string): () => void {
    if (this.closed) throw new AttachmentStorageError('STORE_CLOSED');
    const blobId = validatedBlobId(value);
    const state = this.states.get(blobId) ?? { readers: 0, deleting: false };
    if (state.deleting) throw new AttachmentStorageError('BLOB_IN_USE');
    state.readers += 1;
    this.states.set(blobId, state);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      state.readers -= 1;
      if (state.readers === 0 && !state.deleting) this.states.delete(blobId);
    };
  }

  beginDelete(value: BlobId | string): () => void {
    if (this.closed) throw new AttachmentStorageError('STORE_CLOSED');
    const blobId = validatedBlobId(value);
    const state = this.states.get(blobId) ?? { readers: 0, deleting: false };
    if (state.readers > 0 || state.deleting) {
      throw new AttachmentStorageError('BLOB_IN_USE');
    }
    state.deleting = true;
    this.states.set(blobId, state);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      state.deleting = false;
      if (state.readers === 0) this.states.delete(blobId);
    };
  }

  close(): void {
    this.closed = true;
    this.states.clear();
  }
}
