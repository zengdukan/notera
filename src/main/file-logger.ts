/* eslint-disable no-await-in-loop */
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type DiagnosticLogLevel = 'INFO' | 'WARN' | 'ERROR';

export type DiagnosticLogValue = string | number | boolean | null;

export type DiagnosticLogDetails = Readonly<
  Record<string, DiagnosticLogValue | undefined>
>;

export interface FileLogger {
  readonly filePath: string;
  log(
    level: DiagnosticLogLevel,
    event: string,
    details?: DiagnosticLogDetails,
  ): void;
  error(event: string, details?: DiagnosticLogDetails): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export const LOG_FILE_NAME = 'notera.log';
export const LOG_ROTATION_BYTES = 5 * 1024 * 1024;
export const LOG_ROTATION_FILES = 3;

const SENSITIVE_KEY =
  /(?:password|passphrase|secret|token|authorization|cookie|body|content|filename|file_name|filepath|file_path|absolute_path|path|url|collection|note)/iu;
const MAX_TEXT_LENGTH = 512;

function sanitizeText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]')
    .replace(
      /(?:token|password|secret|authorization)=([^&\s]+)/giu,
      '[REDACTED]=[REDACTED]',
    )
    .replace(/https?:\/\/[^\s]+/giu, '[REDACTED_URL]')
    .replace(/[A-Za-z]:\\[^\s"']+/gu, '[REDACTED_PATH]')
    .slice(0, MAX_TEXT_LENGTH);
}

function sanitizeDetails(
  details: DiagnosticLogDetails | undefined,
): Record<string, DiagnosticLogValue> {
  if (details === undefined) return {};
  return Object.entries(details).reduce<Record<string, DiagnosticLogValue>>(
    (result, [key, value]) => {
      if (value === undefined || SENSITIVE_KEY.test(key)) return result;
      if (typeof value === 'string') result[key] = sanitizeText(value);
      else if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        result[key] = value;
      }
      return result;
    },
    {},
  );
}

function errorDetails(error: unknown): DiagnosticLogDetails {
  if (error instanceof Error) {
    return { errorType: error.name };
  }
  return { errorType: typeof error };
}

export function createFileLogger(input: {
  readonly directory: string;
  readonly now?: () => number;
}): FileLogger {
  const filePath = join(input.directory, LOG_FILE_NAME);
  const now = input.now ?? Date.now;
  let queue = Promise.resolve();
  let closed = false;

  const rotate = async (): Promise<void> => {
    for (let index = LOG_ROTATION_FILES - 2; index >= 1; index -= 1) {
      const source = `${filePath}.${index}`;
      const target = `${filePath}.${index + 1}`;
      try {
        await rename(source, target);
      } catch {
        // A missing historical file is expected on first use.
      }
    }
    try {
      await rename(filePath, `${filePath}.1`);
    } catch {
      // A missing active file is expected on first use.
    }
  };

  const write = async (line: string): Promise<void> => {
    await mkdir(input.directory, { recursive: true });
    try {
      const current = await stat(filePath);
      if (current.size + Buffer.byteLength(line, 'utf8') > LOG_ROTATION_BYTES) {
        await rotate();
      }
    } catch {
      // The active file may not exist yet.
    }
    await appendFile(filePath, line, 'utf8');
  };

  const enqueue = (line: string): void => {
    queue = queue.then(() => write(line)).catch(() => undefined);
  };

  const log = (
    level: DiagnosticLogLevel,
    event: string,
    details?: DiagnosticLogDetails,
  ): void => {
    if (closed) return;
    const record = {
      timestamp: new Date(now()).toISOString(),
      level,
      event: sanitizeText(event),
      ...sanitizeDetails(details),
    };
    enqueue(`${JSON.stringify(record)}\n`);
  };

  return Object.freeze({
    filePath,
    log,
    error(event: string, details?: DiagnosticLogDetails) {
      log('ERROR', event, details);
    },
    flush() {
      return queue;
    },
    async close() {
      await queue;
      closed = true;
    },
  });
}

export function diagnosticErrorDetails(error: unknown): DiagnosticLogDetails {
  return errorDetails(error);
}
