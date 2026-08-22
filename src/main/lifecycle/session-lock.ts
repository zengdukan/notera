import {
  ApplicationError,
  type ProfileManager,
} from '@notera/application';

import type { MediaGateway } from '../attachments/media-gateway';
import type { SessionCommandGate } from '../ipc/local-notes-handlers';
import type { OperationRegistry } from '../operations/registry';

export type LockReason =
  | 'MANUAL'
  | 'SWITCHED'
  | 'SYSTEM_LOCK'
  | 'SYSTEM_SUSPEND'
  | 'IDLE_TIMEOUT'
  | 'SESSION_CLOSED';

export interface ProfileEventSink {
  locked(reason: LockReason): void;
}

type CreateInput = Parameters<ProfileManager['createProfile']>[0];
type UnlockInput = Parameters<ProfileManager['unlockProfile']>[0];
type SwitchInput = Parameters<ProfileManager['switchProfile']>[0];
type UnlockedSession = Awaited<ReturnType<ProfileManager['createProfile']>>;

async function runAll(
  operations: readonly (() => Promise<void> | void)[],
): Promise<void> {
  let firstError: unknown;
  await operations.reduce<Promise<void>>(
    (sequence, operation) =>
      sequence.then(async () => {
        try {
          await operation();
        } catch (error) {
          if (firstError === undefined) firstError = error;
        }
      }),
    Promise.resolve(),
  );
  if (firstError !== undefined) throw firstError;
}

export class SessionLifecycle implements SessionCommandGate {
  private readonly manager: ProfileManager;

  private readonly operations: Pick<
    OperationRegistry,
    'beginSession' | 'endSession'
  >;

  private readonly media: Pick<MediaGateway, 'revokeAll'>;

  private readonly sink: ProfileEventSink;

  private readonly randomUUID: () => string;

  private queue: Promise<void> = Promise.resolve();

  private pendingTransitions = 0;

  private sessionActive: boolean;

  private accepting: boolean;

  private closing = false;

  private lockPromise: Promise<void> | undefined;

  private closePromise: Promise<void> | undefined;

  constructor(input: {
    readonly manager: ProfileManager;
    readonly operations: Pick<
      OperationRegistry,
      'beginSession' | 'endSession'
    >;
    readonly media: Pick<MediaGateway, 'revokeAll'>;
    readonly sink: ProfileEventSink;
    readonly randomUUID: () => string;
  }) {
    this.manager = input.manager;
    this.operations = input.operations;
    this.media = input.media;
    this.sink = input.sink;
    this.randomUUID = input.randomUUID;
    this.sessionActive = this.manager.getSessionState().state === 'UNLOCKED';
    if (this.sessionActive) {
      this.operations.beginSession(this.randomUUID());
    }
    this.accepting = this.sessionActive;
  }

  run<Result>(operation: () => Promise<Result> | Result): Promise<Result> {
    if (!this.accepting || this.closing || this.pendingTransitions > 0) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    return Promise.resolve().then(operation);
  }

  create(input: CreateInput): Promise<UnlockedSession> {
    return this.transition(async () => {
      const result = await this.manager.createProfile(input);
      this.activateSession();
      return result;
    });
  }

  unlock(input: UnlockInput): Promise<UnlockedSession> {
    return this.transition(async () => {
      const result = await this.manager.unlockProfile(input);
      this.activateSession();
      return result;
    });
  }

  switch(input: SwitchInput): Promise<UnlockedSession> {
    return this.transition(async () => {
      if (this.sessionActive) {
        this.sessionActive = false;
        this.emit('SWITCHED');
        await runAll([
          () => this.operations.endSession(),
          () => this.media.revokeAll(),
        ]);
      }
      const result = await this.manager.switchProfile(input);
      this.activateSession();
      return result;
    });
  }

  lock(
    reason: Exclude<LockReason, 'SWITCHED' | 'SESSION_CLOSED'>,
  ): Promise<void> {
    if (this.lockPromise !== undefined) return this.lockPromise;
    const transition = this.transition(() => this.lockActive(reason));
    const merged = transition.finally(() => {
      if (this.lockPromise === merged) this.lockPromise = undefined;
    });
    this.lockPromise = merged;
    return merged;
  }

  remove(localProfileId: string): Promise<void> {
    return this.transition(async () => {
      const state = this.manager.getSessionState();
      if (
        state.state === 'UNLOCKED' &&
        state.localProfileId === localProfileId
      ) {
        await this.lockActive('MANUAL');
      }
      await this.manager.removeProfileFromDevice(localProfileId as never);
    });
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.closing = true;
    this.accepting = false;
    const transition = this.transition(async () => {
      const wasActive = this.sessionActive;
      this.sessionActive = false;
      const cleanup: Array<() => Promise<void> | void> = [];
      if (wasActive) {
        cleanup.push(
          () => this.operations.endSession(),
          () => this.media.revokeAll(),
        );
      }
      cleanup.push(() => this.manager.close());
      let failure: unknown;
      try {
        await runAll(cleanup);
      } catch (error) {
        failure = error;
      }
      if (wasActive) this.emit('SESSION_CLOSED');
      if (failure !== undefined) throw failure;
    });
    const merged = transition.finally(() => {
      this.accepting = false;
    });
    this.closePromise = merged;
    return merged;
  }

  private transition<Result>(
    operation: () => Promise<Result> | Result,
  ): Promise<Result> {
    this.pendingTransitions += 1;
    this.accepting = false;
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      this.pendingTransitions -= 1;
      this.accepting =
        this.sessionActive &&
        !this.closing &&
        this.pendingTransitions === 0;
    });
  }

  private activateSession(): void {
    this.operations.beginSession(this.randomUUID());
    this.sessionActive = true;
  }

  private async lockActive(
    reason: Exclude<LockReason, 'SWITCHED' | 'SESSION_CLOSED'>,
  ): Promise<void> {
    if (!this.sessionActive) return;
    this.sessionActive = false;
    let failure: unknown;
    try {
      await runAll([
        () => this.operations.endSession(),
        () => this.media.revokeAll(),
        () => this.manager.lockProfile(),
      ]);
    } catch (error) {
      failure = error;
    }
    this.emit(reason);
    if (failure !== undefined) throw failure;
  }

  private emit(reason: LockReason): void {
    try {
      this.sink.locked(reason);
    } catch {
      // Renderer notification cannot change the secure lifecycle state.
    }
  }
}
