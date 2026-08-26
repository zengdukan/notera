import { defaultSchema } from '@atlaskit/adf-schema/schema-default';

import {
  createMermaidAdf,
  getMermaidSource,
  isMermaidExtensionKey,
  MERMAID_EXTENSION_TYPE,
} from './types';

describe('Mermaid ADF contract', () => {
  it('creates and round-trips a block extension', () => {
    const mermaid = createMermaidAdf('flowchart LR\nA --> B');
    const document = { type: 'doc', content: [mermaid] };

    expect(mermaid).toEqual({
      type: 'extension',
      attrs: {
        extensionType: MERMAID_EXTENSION_TYPE,
        extensionKey: 'mermaid:block',
        parameters: {
          version: 1,
          source: 'flowchart LR\nA --> B',
        },
        layout: 'default',
      },
    });

    const parsed = defaultSchema.nodeFromJSON(document).firstChild;
    expect(parsed?.type.name).toBe('extension');
    expect(parsed?.attrs).toMatchObject(mermaid.attrs);
  });

  it('reads malformed parameters defensively', () => {
    expect(getMermaidSource(undefined)).toBe('');
    expect(getMermaidSource({ source: 42 })).toBe('');
    expect(getMermaidSource({ source: 'sequenceDiagram' })).toBe(
      'sequenceDiagram',
    );
    expect(isMermaidExtensionKey('mermaid:block')).toBe(true);
    expect(isMermaidExtensionKey('mermaid:inline')).toBe(false);
  });
});
