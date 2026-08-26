import path from 'node:path';

export const DEFAULT_MEDIA_API_PATH = '/api/media';
export const DEFAULT_MEDIA_HOST = '127.0.0.1';
export const DEFAULT_MEDIA_MAX_FILE_SIZE = '1gb';

export function normalizeApiPath(value = DEFAULT_MEDIA_API_PATH): string {
  const normalized = `/${value}`.replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
  if (normalized === '/') {
    throw new Error('Media API path cannot be the root path.');
  }
  return normalized;
}

export function normalizePort(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`Invalid Media server port: ${value}`);
  }
  return value;
}

export interface DemoMediaServerOptions {
  readonly dataRoot: string;
  readonly host?: string;
  readonly port?: number;
  readonly apiPath?: string;
  readonly maxFileSize?: string;
  readonly publicBaseUrl?: string;
  readonly logger?: { error(code: string): void };
}

export interface DemoMediaServerConfig {
  readonly dataRoot: string;
  readonly host: string;
  readonly port: number;
  readonly apiPath: string;
  readonly maxFileSize: string;
  readonly publicBaseUrl?: string;
  readonly logger: { error(code: string): void };
}

export function createDemoMediaServerConfig(
  options: DemoMediaServerOptions,
): DemoMediaServerConfig {
  if (options.dataRoot.trim().length === 0) {
    throw new Error('Media data root cannot be empty.');
  }
  return Object.freeze({
    dataRoot: path.resolve(options.dataRoot),
    host: options.host ?? DEFAULT_MEDIA_HOST,
    port: normalizePort(options.port ?? 0),
    apiPath: normalizeApiPath(options.apiPath),
    maxFileSize: options.maxFileSize ?? DEFAULT_MEDIA_MAX_FILE_SIZE,
    ...(options.publicBaseUrl === undefined
      ? {}
      : { publicBaseUrl: options.publicBaseUrl.replace(/\/+$/u, '') }),
    logger: options.logger ?? {
      error(code: string) {
        process.stderr.write(`[media-service] ${code}\n`);
      },
    },
  });
}
