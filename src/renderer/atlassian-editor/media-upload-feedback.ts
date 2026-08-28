export interface MediaUploadRejectionFeedback {
  readonly noteId: string;
  readonly fileName: string;
  readonly limitBytes: number;
}

type MediaUploadRejectionListener = (
  feedback: MediaUploadRejectionFeedback,
) => void;

const listeners = new Map<string, Set<MediaUploadRejectionListener>>();

export function publishMediaUploadRejection(
  feedback: MediaUploadRejectionFeedback,
): void {
  listeners.get(feedback.noteId)?.forEach((listener) => listener(feedback));
}

export function subscribeMediaUploadRejection(
  noteId: string,
  listener: MediaUploadRejectionListener,
): () => void {
  let noteListeners = listeners.get(noteId);
  if (noteListeners === undefined) {
    noteListeners = new Set();
    listeners.set(noteId, noteListeners);
  }
  noteListeners.add(listener);
  return () => {
    noteListeners.delete(listener);
    if (noteListeners.size === 0) listeners.delete(noteId);
  };
}

export function formatMediaUploadLimit(limitBytes: number): string {
  return `${limitBytes / 1024 / 1024} MB`;
}
