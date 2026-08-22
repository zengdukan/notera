import '@atlaskit/css-reset';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { ExportRenderDocument } from '../../shared';
import { ReadOnlyDocument } from './ReadOnlyDocument';
import { createExportReadiness } from './readiness';
import './print.css';

class ExportErrorBoundary extends React.Component<
  React.PropsWithChildren<{ readonly payload: ExportRenderDocument }>,
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    window.noteraExport.failed({
      operationId: this.props.payload.operationId,
      nonce: this.props.payload.nonce,
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ExportPage({ payload }: { readonly payload: ExportRenderDocument }) {
  const readiness = useMemo(createExportReadiness, [payload.operationId]);
  const rootRef = useRef<HTMLElement>(null);
  const reported = useRef(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!rendered || reported.current || rootRef.current === null) return;
    reported.current = true;
    let active = true;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    void readiness
      .waitForStable(rootRef.current, fontsReady)
      .then((lossyNodeCount) => {
        if (!active) return;
        window.noteraExport.ready({
          operationId: payload.operationId,
          nonce: payload.nonce,
          lossyNodeCount,
        });
      })
      .catch(() => {
        if (!active) return;
        window.noteraExport.failed({
          operationId: payload.operationId,
          nonce: payload.nonce,
        });
      });
    return () => {
      active = false;
    };
  }, [payload.nonce, payload.operationId, readiness, rendered]);

  return (
    <main ref={rootRef}>
      <ReadOnlyDocument
        onRendered={() => setRendered(true)}
        payload={payload}
        readiness={readiness}
      />
    </main>
  );
}

function ExportApp() {
  const [payload, setPayload] = useState<ExportRenderDocument | null>(null);
  useEffect(() => window.noteraExport.receiveDocument(setPayload), []);
  if (payload === null) return null;
  return (
    <ExportErrorBoundary payload={payload}>
      <ExportPage payload={payload} />
    </ExportErrorBoundary>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('Export root is missing.');
createRoot(container).render(<ExportApp />);
