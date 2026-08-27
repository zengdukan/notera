import type { NoteMutationGuard } from './note-mutation-guard';

export interface ActiveDocumentHandle {
  readonly isDirty: () => boolean;
  readonly flush: () => Promise<void>;
  readonly stop: () => void;
}

export class ActiveDocumentLifecycle implements NoteMutationGuard {
  private active?: ActiveDocumentHandle;

  attach(handle: ActiveDocumentHandle): () => void {
    this.active?.stop();
    this.active = handle;
    return () => {
      if (this.active !== handle) return;
      handle.stop();
      this.active = undefined;
    };
  }

  isDirty = (): boolean => this.active?.isDirty() ?? false;

  flush = async (): Promise<void> => {
    if (this.active?.isDirty()) await this.active.flush();
  };

  async flushBefore(
    operation: 'move' | 'copy' | 'trash',
  ): Promise<'ready' | 'blocked'> {
    void operation;
    try {
      await this.flush();
      return 'ready';
    } catch {
      return 'blocked';
    }
  }

  clear(): void {
    this.active?.stop();
    this.active = undefined;
  }
}
