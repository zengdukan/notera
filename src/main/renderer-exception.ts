export interface RendererExceptionDetails {
  readonly message: string;
  readonly stack?: string;
  readonly line?: number;
  readonly sourceId?: string;
}

type RecordValue = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null
    ? (value as RecordValue)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Converts a Chrome Runtime.exceptionThrown payload into safe log fields. */
export function rendererExceptionDetails(
  payload: unknown,
): RendererExceptionDetails | undefined {
  const payloadRecord = asRecord(payload);
  const exception = asRecord(payloadRecord?.exceptionDetails);
  if (exception === undefined) return undefined;

  const exceptionValue = asRecord(exception.exception);
  const message =
    asString(exception.text) ??
    asString(exceptionValue?.description) ??
    'Renderer exception';
  const stackTrace = asRecord(exception.stackTrace);
  const rawFrames = stackTrace?.callFrames;
  const frames = Array.isArray(rawFrames)
    ? rawFrames
        .map(asRecord)
        .filter((frame): frame is RecordValue => frame !== undefined)
    : [];
  const stack = frames
    .map((frame) => {
      const functionName = asString(frame.functionName) ?? '<anonymous>';
      const url = asString(frame.url) ?? '<anonymous>';
      const line =
        typeof frame.lineNumber === 'number' ? frame.lineNumber + 1 : 0;
      const column =
        typeof frame.columnNumber === 'number' ? frame.columnNumber + 1 : 0;
      return `    at ${functionName} (${url}:${line}:${column})`;
    })
    .join('\n');
  const firstFrame = frames[0];
  const firstLine = firstFrame?.lineNumber;
  const line = typeof firstLine === 'number' ? firstLine + 1 : undefined;
  const sourceId = asString(firstFrame?.url);

  return {
    message,
    ...(stack.length > 0 ? { stack: `${message}\n${stack}` } : {}),
    ...(line === undefined ? {} : { line }),
    ...(sourceId === undefined ? {} : { sourceId }),
  };
}
