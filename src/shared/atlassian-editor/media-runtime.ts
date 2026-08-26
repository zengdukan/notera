export const MEDIA_API_ARGUMENT_PREFIX =
  '--atlassian-editor-media-api-base-url=';

const INVALID_ADDRESS = 'Invalid Atlassian Editor Media API address.';

export interface AtlassianEditorRuntime {
  readonly mediaApiBaseUrl: string;
}

export function validateMediaApiBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(INVALID_ADDRESS);
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.port.length === 0 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    parsed.pathname !== '/api/media' ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error(INVALID_ADDRESS);
  }
  return value;
}

export function createMediaApiArgument(apiBaseUrl: string): string {
  return `${MEDIA_API_ARGUMENT_PREFIX}${validateMediaApiBaseUrl(apiBaseUrl)}`;
}

export function parseMediaApiArgument(argv: readonly string[]): string {
  const matches = argv.filter((argument) =>
    argument.startsWith(MEDIA_API_ARGUMENT_PREFIX),
  );
  if (matches.length === 0) {
    throw new Error('Missing Atlassian Editor Media API address.');
  }
  if (matches.length > 1) {
    throw new Error('Duplicate Atlassian Editor Media API address.');
  }
  return validateMediaApiBaseUrl(
    matches[0].slice(MEDIA_API_ARGUMENT_PREFIX.length),
  );
}
