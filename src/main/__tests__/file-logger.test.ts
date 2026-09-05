import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createFileLogger,
  LOG_ROTATION_BYTES,
  LOG_ROTATION_FILES,
} from '../file-logger';

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'notera-log-'));
}

describe('file logger', () => {
  it('writes ordered JSONL records and removes sensitive fields', async () => {
    const directory = await temporaryDirectory();
    const logger = createFileLogger({
      directory,
      now: () => Date.parse('2026-01-02T03:04:05.000Z'),
    });

    logger.log('INFO', 'MEDIA_HTTP', {
      operation: 'auth',
      status: 200,
      token: 'secret-token',
      path: 'C:\\private\\note.txt',
      message: 'Bearer abc123 token=hidden',
    });
    logger.error('IPC_FAILED', { channel: 'notera:note:save-draft' });
    await logger.flush();

    const records = (await readFile(logger.filePath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toEqual([
      {
        timestamp: '2026-01-02T03:04:05.000Z',
        level: 'INFO',
        event: 'MEDIA_HTTP',
        operation: 'auth',
        status: 200,
        message: 'Bearer [REDACTED] [REDACTED]=[REDACTED]',
      },
      {
        timestamp: '2026-01-02T03:04:05.000Z',
        level: 'ERROR',
        event: 'IPC_FAILED',
        channel: 'notera:note:save-draft',
      },
    ]);
  });

  it('rotates the active log and keeps the configured number of files', async () => {
    const directory = await temporaryDirectory();
    const logger = createFileLogger({ directory });
    const payload = 'x'.repeat(LOG_ROTATION_BYTES);

    await writeFile(logger.filePath, payload, 'utf8');
    logger.log('INFO', 'SECOND');
    await logger.flush();

    await expect(stat(`${logger.filePath}.1`)).resolves.toBeDefined();
    expect(await readFile(logger.filePath, 'utf8')).toContain('SECOND');
    await expect(stat(`${logger.filePath}.3`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(LOG_ROTATION_FILES).toBe(3);
  });

  it('does not reject when the log directory cannot be written', async () => {
    const logger = createFileLogger({ directory: join('NUL', 'notera') });
    logger.error('WRITE_FAILURE');
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});
