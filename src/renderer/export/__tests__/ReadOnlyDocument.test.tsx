/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useIntl } from 'react-intl';

import {
  ReadOnlyDocument,
  createExportExtensionHandlers,
} from '../ReadOnlyDocument';
import { createExportMediaProvider } from '../media-provider';
import { createExportReadiness } from '../readiness';

const mockReactRenderer = jest.fn((props: unknown) => (
  <IntlAwareRenderer props={props} />
));

function IntlAwareRenderer({ props }: { readonly props: unknown }) {
  const intl = useIntl();
  return (
    <div
      data-has-props={String(props !== undefined)}
      data-intl-locale={intl.locale}
      data-testid="atlaskit-renderer"
    />
  );
}

const mockMermaidInitialize = jest.fn();
const mockMermaidParse = jest.fn().mockResolvedValue(false);
const mockMermaidRender = jest.fn();

jest.mock('@atlaskit/renderer', () => ({
  ReactRenderer: (props: unknown) => mockReactRenderer(props),
}));

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: mockMermaidInitialize,
    parse: mockMermaidParse,
    render: mockMermaidRender,
  },
}));

const operationId = '10000000-0000-4000-8000-000000000001';
const nonce = 'n'.repeat(43);
const basePayload = {
  operationId,
  nonce,
  title: 'Export title',
  document: {
    version: 1 as const,
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Saved ADF' }],
      },
    ],
  },
  mediaBaseUrl: `notera-export-media://${operationId}`,
  attachments: [],
};

describe('read-only export document', () => {
  beforeEach(() => {
    mockReactRenderer.mockClear();
    mockMermaidInitialize.mockClear();
    mockMermaidParse.mockReset().mockResolvedValue(false);
    mockMermaidRender.mockReset();
  });

  it('provides Intl context and fixed read-only options to Atlaskit', () => {
    const readiness = createExportReadiness();
    render(<ReadOnlyDocument payload={basePayload} readiness={readiness} />);

    expect(screen.getByTestId('atlaskit-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('atlaskit-renderer')).toHaveAttribute(
      'data-intl-locale',
      'en',
    );
    expect(mockReactRenderer).toHaveBeenCalledTimes(1);
    expect(mockReactRenderer.mock.calls[0][0]).toMatchObject({
      adfStage: 'stage0',
      appearance: 'full-page',
      disableActions: true,
      disableTableOverflowShadow: true,
      document: basePayload.document,
      media: {
        allowCaptions: true,
        allowLinking: false,
        enableDownloadButton: false,
      },
      shouldOpenMediaViewer: false,
    });
    expect(mockReactRenderer.mock.calls[0][0]).toHaveProperty('dataProviders');
    expect(mockReactRenderer.mock.calls[0][0]).toHaveProperty(
      'extensionHandlers',
    );
  });

  it('creates a view-only media provider bound to the task protocol', async () => {
    const provider = await createExportMediaProvider(basePayload);
    const auth = await provider.viewMediaClientConfig.authProvider({});

    expect(provider).toEqual({
      viewMediaClientConfig: expect.any(Object),
    });
    expect(auth).toEqual({
      clientId: operationId,
      token: nonce,
      baseUrl: basePayload.mediaBaseUrl,
    });
  });

  it('renders image attachments directly through the export resource lease', () => {
    const attachmentId = '20000000-0000-4000-8000-000000000002';
    const payload = {
      ...basePayload,
      attachments: [
        {
          id: attachmentId,
          fileName: 'chart.png',
          mimeType: 'image/png',
          byteLength: 42,
          relativePath: 'assets/chart.png' as const,
        },
      ],
    };
    render(
      <ReadOnlyDocument
        payload={payload}
        readiness={createExportReadiness(payload.document)}
      />,
    );
    const rendererProps = mockReactRenderer.mock.calls[0][0] as {
      nodeComponents?: Record<string, React.ComponentType<any>>;
    };
    const Media = rendererProps.nodeComponents?.media;
    expect(Media).toEqual(expect.any(Function));
    if (Media === undefined) throw new Error('Export media renderer missing');

    render(
      <Media
        alt="Exported chart"
        id={attachmentId}
        type="file"
        width={640}
        height={480}
      />,
    );

    expect(screen.getByRole('img', { name: 'Exported chart' })).toHaveAttribute(
      'src',
      `${basePayload.mediaBaseUrl}/file/${attachmentId}/image`,
    );
  });

  it('renders valid math and explicit source-preserving invalid placeholders', () => {
    const unknownDocument = {
      ...basePayload.document,
      content: [
        {
          type: 'extension',
          attrs: {
            extensionType: 'example.unknown',
            extensionKey: 'diagram',
            parameters: { source: 'raw unknown source' },
          },
        },
      ],
    };
    const handlers = createExportExtensionHandlers(
      unknownDocument,
      createExportReadiness(),
    );

    const mathHandler = handlers['com.atlassian.editor.math'];
    if (typeof mathHandler !== 'function')
      throw new Error('math handler missing');
    const { rerender } = render(
      mathHandler(
        {
          type: 'extension',
          extensionType: 'com.atlassian.editor.math',
          extensionKey: 'math:block',
          parameters: { version: 1, latex: 'x^2' },
        },
        {},
      ),
    );
    expect(document.querySelector('.katex')).not.toBeNull();

    rerender(
      mathHandler(
        {
          type: 'extension',
          extensionType: 'com.atlassian.editor.math',
          extensionKey: 'math:block',
          parameters: { version: 1, latex: '\\definitelyInvalid' },
        },
        {},
      ),
    );
    expect(screen.getByText('\\definitelyInvalid')).toHaveAttribute(
      'data-export-lossy',
      'true',
    );

    const unknownHandler = handlers['example.unknown'];
    if (typeof unknownHandler !== 'function') {
      throw new Error('unknown handler missing');
    }
    rerender(
      unknownHandler(
        {
          type: 'extension',
          extensionType: 'example.unknown',
          extensionKey: 'diagram',
          parameters: { source: 'raw unknown source' },
        },
        {},
      ),
    );
    expect(screen.getByText(/不支持的扩展/u)).toBeInTheDocument();
    expect(screen.getByText('raw unknown source')).toBeInTheDocument();
  });

  it('waits for invalid Mermaid and preserves its source without fetch', async () => {
    const readiness = createExportReadiness();
    const handlers = createExportExtensionHandlers(
      basePayload.document,
      readiness,
    );
    const mermaidHandler = handlers['com.atlassian.editor.mermaid'];
    if (typeof mermaidHandler !== 'function') {
      throw new Error('Mermaid handler missing');
    }
    const fetchSpy = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchSpy,
    });
    const view = render(
      mermaidHandler(
        {
          type: 'extension',
          extensionType: 'com.atlassian.editor.mermaid',
          extensionKey: 'mermaid:block',
          parameters: { version: 1, source: 'not a diagram' },
        },
        {},
      ),
    );

    expect(await screen.findByText('not a diagram')).toHaveAttribute(
      'data-export-lossy',
      'true',
    );
    await expect(
      readiness.waitForStable(view.container, Promise.resolve()),
    ).resolves.toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, 'fetch');
  });
});
