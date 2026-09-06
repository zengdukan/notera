const STACK_MARKER = '\n[Notera] stack=';

export interface RendererConsoleDetails {
  readonly message: string;
  readonly line: number;
  readonly sourceId: string;
  readonly stack?: string;
}

/**
 * Extracts the structured stack that the preload bridge appends to renderer
 * errors while retaining the original console message for diagnostics.
 */
export function rendererConsoleDetails(
  message: string,
  line: number,
  sourceId: string,
): RendererConsoleDetails {
  const markerIndex = message.indexOf(STACK_MARKER);
  if (markerIndex < 0) {
    return { message, line, sourceId };
  }

  const stack = message.slice(markerIndex + STACK_MARKER.length).trim();
  return {
    message: message.slice(0, markerIndex),
    line,
    sourceId,
    ...(stack.length > 0 ? { stack } : {}),
  };
}

