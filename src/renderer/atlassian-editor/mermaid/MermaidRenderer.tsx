/** @jsxImportSource @emotion/react */
import type { ExtensionComponentProps } from '@atlaskit/editor-common/extensions';

import {
  mermaidBlockStyles,
  mermaidErrorStyles,
  mermaidStatusStyles,
} from './styles';
import { getMermaidSource, type MermaidParameters } from './types';
import { useMermaidRender } from './use-mermaid-render';

type MermaidRendererProps = {
  source: string;
};

export function MermaidRenderer({ source }: MermaidRendererProps) {
  const result = useMermaidRender(source);

  if (result.status === 'loading') {
    return (
      <div
        aria-label="Mermaid diagram is loading"
        className="mermaid-extension mermaid-extension--loading"
        css={[mermaidBlockStyles, mermaidStatusStyles]}
        role="status"
      >
        Rendering diagram…
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div
        aria-label="Invalid Mermaid diagram"
        className="mermaid-extension mermaid-extension--invalid"
        css={[mermaidBlockStyles, mermaidErrorStyles]}
        role="group"
      >
        <div>{result.error}</div>
        {source ? <pre>{source}</pre> : null}
      </div>
    );
  }

  return (
    <div
      aria-label="Mermaid diagram"
      className="mermaid-extension"
      css={mermaidBlockStyles}
      dangerouslySetInnerHTML={{ __html: result.svg }}
      role="img"
    />
  );
}

export function MermaidExtensionComponent({
  node,
}: ExtensionComponentProps<MermaidParameters>) {
  return <MermaidRenderer source={getMermaidSource(node.parameters)} />;
}
