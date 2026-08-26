import { useEffect, useId, useRef, useState } from 'react';

import { renderMermaid } from './mermaid';

export type MermaidRenderState =
  | { error: null; source: string; status: 'loading'; svg: null }
  | { error: null; source: string; status: 'success'; svg: string }
  | { error: string; source: string; status: 'error'; svg: null };

export function useMermaidRender(
  source: string,
  debounceMs = 0,
): MermaidRenderState {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');
  const requestId = useRef(0);
  const [state, setState] = useState<MermaidRenderState>(() =>
    source.trim()
      ? { error: null, source, status: 'loading', svg: null }
      : {
          error: 'Enter a Mermaid diagram definition',
          source,
          status: 'error',
          svg: null,
        },
  );

  useEffect(() => {
    const currentRequest = ++requestId.current;

    if (!source.trim()) {
      setState({
        error: 'Enter a Mermaid diagram definition',
        source,
        status: 'error',
        svg: null,
      });
      return;
    }

    setState({ error: null, source, status: 'loading', svg: null });
    const timeout = window.setTimeout(() => {
      void renderMermaid(`mermaid-${reactId}-${currentRequest}`, source).then(
        (result) => {
          if (currentRequest !== requestId.current) {
            return;
          }

          if (result.error !== null) {
            setState({
              error: result.error,
              source,
              status: 'error',
              svg: null,
            });
          } else {
            setState({
              error: null,
              source,
              status: 'success',
              svg: result.svg,
            });
          }
        },
      );
    }, debounceMs);

    return () => window.clearTimeout(timeout);
  }, [debounceMs, reactId, source]);

  return state;
}
