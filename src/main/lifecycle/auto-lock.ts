import { ApplicationError, type SessionState } from '@notera/application';

import { IPC_ERROR_CODES, type IpcErrorCode } from '../../shared';
import type { SessionLifecycle } from './session-lock';

export const IDLE_POLL_MS = 5_000;

type PowerEvent = 'lock-screen' | 'suspend';

export interface PowerMonitorPort {
  on(event: PowerEvent, listener: () => void): void;
  removeListener(event: PowerEvent, listener: () => void): void;
}

export interface SchedulerPort {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface AutoLockLogger {
  error(code: IpcErrorCode): void;
}

const knownCodes = new Set<string>(IPC_ERROR_CODES);

function safeCode(error: unknown): IpcErrorCode {
  if (error instanceof ApplicationError && knownCodes.has(error.code)) {
    return error.code as IpcErrorCode;
  }
  return 'IPC_OPERATION_FAILED';
}

export class AutoLockController {
  private readonly input: {
    readonly powerMonitor: PowerMonitorPort;
    readonly scheduler: SchedulerPort;
    readonly lifecycle: Pick<SessionLifecycle, 'lock'>;
    readonly getSessionState: () => SessionState;
    readonly getAutoLockMinutes: () => number;
    readonly now: () => number;
    readonly logger: AutoLockLogger;
  };

  private readonly lockScreen = () => this.trigger('SYSTEM_LOCK');

  private readonly suspend = () => this.trigger('SYSTEM_SUSPEND');

  private readonly poll = () => {
    try {
      if (this.input.getSessionState().state !== 'UNLOCKED') return;
      const timeout = this.input.getAutoLockMinutes() * 60_000;
      if (this.input.now() - this.lastActivityAt >= timeout) {
        this.lastActivityAt = this.input.now();
        this.trigger('IDLE_TIMEOUT');
      }
    } catch (error) {
      this.input.logger.error(safeCode(error));
    }
  };

  private timer: unknown;

  private started = false;

  private lastActivityAt: number;

  constructor(input: AutoLockController['input']) {
    this.input = input;
    this.lastActivityAt = input.now();
  }

  touchActivity(): void {
    this.lastActivityAt = this.input.now();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.input.powerMonitor.on('lock-screen', this.lockScreen);
    this.input.powerMonitor.on('suspend', this.suspend);
    this.timer = this.input.scheduler.setInterval(this.poll, IDLE_POLL_MS);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.input.powerMonitor.removeListener('lock-screen', this.lockScreen);
    this.input.powerMonitor.removeListener('suspend', this.suspend);
    this.input.scheduler.clearInterval(this.timer);
    this.timer = undefined;
  }

  private trigger(
    reason: 'SYSTEM_LOCK' | 'SYSTEM_SUSPEND' | 'IDLE_TIMEOUT',
  ): void {
    Promise.resolve()
      .then(() => this.input.lifecycle.lock(reason))
      .catch((error: unknown) => this.input.logger.error(safeCode(error)));
  }
}
